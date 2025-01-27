import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect, Suspense } from "react";
import { useSetProfile, useGetProfile } from "@/hooks/useContract";
import { useToast } from "@/components/ui/use-toast";
import { UserProfile, SocialAccount } from "@/types/profile";
import { useUserStore } from '@/store/userStore';
import { Loader2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useTelegramAuth } from "@/providers/TelegramAuthContext";
import { signIn, useSession } from "next-auth/react";
import { SiGithub, SiX, SiDiscord, SiTelegram } from "@icons-pack/react-simple-icons";
import ImageUpload from "./ImageUpload";
import { useAccount } from "wagmi";
import { encryptData } from "@/utils/encryption";

interface ProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  address: `0x${string}`;
  onSuccess?: () => void;
  initialData?: UserProfile | null;
}

function ProfileSettingsModalInner({
  isOpen,
  onClose,
  address,
  onSuccess,
  initialData,
}: ProfileSettingsModalProps) {
  const { toast } = useToast();
  const [nickname, setNickname] = useState(initialData?.nickname || "");
  const [avatar, setAvatar] = useState(initialData?.avatar || "");
  const { socialAccounts, setSocialAccounts } = useUserStore();
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const setProfile = useSetProfile();
  const { isInitialized, username: telegramUsername, userID: telegramUserId } = useTelegramAuth();
  const { data: session } = useSession();
  const { address: userAddress } = useAccount();
  const isTelegramWebApp = isInitialized;

  // 监听钱包地址变化，清除非 Telegram 的社交账号数据
  useEffect(() => {
    if (userAddress) {
      setSocialAccounts((prev) => ({
        ...(prev || {}),
        telegramUsername: prev?.telegramUsername || "",
        telegramUserId: prev?.telegramUserId || null,
      }));
    }
  }, [userAddress]);

  // 处理 Telegram 账号自动填充
  useEffect(() => {
    if (isTelegramWebApp && telegramUsername && telegramUserId) {
      setSocialAccounts((prev) => ({
        ...(prev || {}),
        telegramUsername,
        telegramUserId: Number(telegramUserId),
      }));
    }
  }, [isTelegramWebApp, telegramUsername, telegramUserId]);

  const handleSave = async () => {
    try {
      setIsLoading(true);

      // 分离公开数据和敏感数据
      const publicData = {
        xUserName: socialAccounts?.xUserName,
        xName: socialAccounts?.xName,
        xId: socialAccounts?.xId,
        discordUserName: socialAccounts?.discordUserName,
        discordName: socialAccounts?.discordName,
        discordId: socialAccounts?.discordId,
        githubUserName: socialAccounts?.githubUserName,
        githubName: socialAccounts?.githubName,
        githubId: socialAccounts?.githubId,
        telegramUsername: socialAccounts?.telegramUsername,
        telegramUserId: socialAccounts?.telegramUserId,
      };

      // 敏感数据加密
      const sensitiveData = {
        xAccessToken: socialAccounts?.xAccessToken,
        discordAccessToken: socialAccounts?.discordAccessToken,
        githubAccessToken: socialAccounts?.githubAccessToken,
      };

      const encryptedTokens = await encryptData(JSON.stringify(sensitiveData));
      const socialAccountsStr = JSON.stringify({
        ...publicData,
        encryptedTokens,
      });

      // 获取签名
      const response = await fetch('/api/profile/sign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nickname,
          avatar,
          socialAccount: socialAccountsStr,
          subject: address,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get signature from server');
      }

      const { signature } = await response.json();

      // 使用签名调用合约
      const { hash } = await setProfile({
        nickname,
        avatar,
        socialAccount: socialAccountsStr,
        signature,
      });

      toast({
        title: "Success",
        description: "Profile updated successfully",
      });
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error("Failed to update profile:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: typeof error === 'object' && error !== null && 'message' in error
          ? String(error.message)
          : 'Failed to update profile',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 获取用户资料
  const { data: profileData, isSuccess: profileLoaded, refetch: refetchProfile } = useGetProfile(address);

  // 初始化用户资料
  useEffect(() => {
    if (profileLoaded && profileData && Array.isArray(profileData)) {
      const [userNickname, userAvatar, socialAccountStr] = profileData;
      setNickname(userNickname || "");
      setAvatar(userAvatar || "");

      try {
        const parsedSocialAccounts = JSON.parse(socialAccountStr || "{}");
        if (Object.keys(parsedSocialAccounts).length > 0) {
          setSocialAccounts(parsedSocialAccounts);
        }
      } catch (error) {
        console.error("Failed to parse social accounts:", error);
      }
    }
  }, [profileLoaded, profileData, setSocialAccounts]);

  // 处理 Telegram 验证点击
  const handleTelegramVerification = () => {
    if (!telegramUsername) {
      toast({
        title: "Info",
        description: "To link your Telegram account, please use this dApp in Telegram Mini App.",
      });
    }
  };

  // 保存表单数据到 localStorage
  const saveFormData = (data: any) => {
    localStorage.setItem("profileFormData", JSON.stringify(data));
  };

  // 从 localStorage 获取表单数据
  const loadFormData = () => {
    const saved = localStorage.getItem("profileFormData");
    return saved ? JSON.parse(saved) : null;
  };

  // 处理社交账号验证
  const handleSocialVerification = async (provider: "twitter" | "discord" | "github") => {
    try {
      setIsVerifying(true);
      saveFormData({ nickname, avatar, socialAccounts });

      // 保存验证信息到 localStorage
      const verificationInfo = { modalType: "profile", provider };
      localStorage.setItem("verificationInfo", JSON.stringify(verificationInfo));
      localStorage.setItem("profileModalShouldOpen", "true");

      await signIn(provider, {
        redirect: true,
        callbackUrl: `${window.location.origin}?modal=profile`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to verify ${provider} account`,
        variant: "destructive",
      });
      setIsVerifying(false);
    }
  };

  // 处理验证回调
  useEffect(() => {
    const savedVerificationInfo = localStorage.getItem("verificationInfo");
    const verificationInfo = savedVerificationInfo ? JSON.parse(savedVerificationInfo) : null;
    const shouldOpenModal = localStorage.getItem("profileModalShouldOpen");
    const urlParams = new URLSearchParams(window.location.search);
    const modalParam = urlParams.get('modal');

    const verifyAccount = async () => {
      if (!session || verificationInfo?.modalType !== "profile" || !verificationInfo?.provider) {
        return;
      }

      try {
        // 重新获取用户资料
        await refetchProfile();

        const savedData = loadFormData();
        if (savedData) {
          // 恢复保存的表单数据
          setNickname(savedData.nickname || "");
          setAvatar(savedData.avatar || "");
          if (savedData.socialAccounts) {
            setSocialAccounts(savedData.socialAccounts);
          }
        }

        const provider = verificationInfo.provider;
        const response = await fetch(`/api/social/${provider}/verify`, {
          headers: {
            Authorization: `Bearer ${(session as any).accessToken}`,
            "X-User-Id": (session as any).user.id,
          },
        });

        const data = await response.json();
        if (data) {
          const socialInfo = getSocialAccountInfo(provider, data, (session as any).accessToken);
          if (socialInfo) {
            setSocialAccounts((prevAccounts: SocialAccount | null) => {
              const newAccounts: SocialAccount = {
                ...(prevAccounts || {}),
                ...socialInfo,
              };
              return newAccounts;
            });
          }

          toast({
            title: "Success",
            description: `${provider} account verified`,
          });
        }
      } catch (error) {
        console.error("Verification error:", error);
        toast({
          title: "Error",
          description: `Failed to verify account`,
          variant: "destructive",
        });
      } finally {
        setIsVerifying(false);
      }
    };

    // 如果有 modal 参数或者 shouldOpenModal，执行验证并打开弹窗
    if (modalParam === 'profile' || shouldOpenModal) {
      verifyAccount();
      if (!isOpen) {
        onSuccess?.();
      }
    }
  }, [session, isOpen, refetchProfile]);
  // 处理关闭弹窗
  const handleClose = () => {
    // 清理所有临时数据
    localStorage.removeItem("verificationInfo");
    localStorage.removeItem("profileModalShouldOpen");
    localStorage.removeItem("profileFormData");

    // 清理 URL 参数
    const newUrl = window.location.pathname;
    window.history.replaceState({}, '', newUrl);

    onClose();
  };

  const getSocialAccountInfo = (
    provider: "twitter" | "discord" | "github",
    data: any,
    accessToken: string
  ) => {
    switch (provider) {
      case "twitter":
        return {
          xUserName: data.data.username,
          xName: data.data.name,
          xId: data.data.id,
          xAccessToken: accessToken,
        };
      case "discord":
        return {
          discordUserName: data.username,
          discordName: data.global_name,
          discordId: data.id,
          discordAccessToken: accessToken,
          discord: `${data.username}#${data.discriminator}`,
        };
      case "github":
        return {
          githubUserName: data.login,
          githubName: data.name,
          githubId: data.id,
          githubAccessToken: accessToken,
          github: data.login,
        };
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px] bg-black/90 border border-purple-500/30 backdrop-blur-xl text-white">
        <DialogHeader>
          <DialogTitle className="text-purple-300">Profile Settings</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div>
            <label className="block text-sm font-medium mb-2">Avatar</label>
            <div className="max-w-[250px]">
              <ImageUpload
                value={avatar}
                onChange={(url) => setAvatar(url)}
                label="Avatar"
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="nickname">Nickname</Label>
            <Input
              id="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="bg-black/50 border-purple-500/30 text-white"
            />
          </div>

          <div className="space-y-4">
            <Label>Social Accounts</Label>
            <div className="grid grid-cols-2 gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSocialVerification("twitter")}
                className="bg-black/50 border-purple-500/30 hover:bg-purple-500/20"
                disabled={isVerifying}
              >
                <SiX className="mr-2 h-4 w-4" />
                {socialAccounts?.xUserName ? socialAccounts.xName : "Verify X"}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSocialVerification("discord")}
                className="bg-black/50 border-purple-500/30 hover:bg-purple-500/20"
                disabled={isVerifying}
              >
                <SiDiscord className="mr-2 h-4 w-4" />
                {socialAccounts?.discordUserName ? socialAccounts.discordName : "Verify Discord"}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSocialVerification("github")}
                className="bg-black/50 border-purple-500/30 hover:bg-purple-500/20"
                disabled={isVerifying}
              >
                <SiGithub className="mr-2 h-4 w-4" />
                {socialAccounts?.githubUserName ? socialAccounts.githubName : "Verify GitHub"}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleTelegramVerification}
                disabled={!isTelegramWebApp}
                className="bg-black/50 border-purple-500/30 hover:bg-purple-500/20"
              >
                <SiTelegram className="mr-2 h-4 w-4" />
                {socialAccounts?.telegramUsername || "Verify Telegram"}
              </Button>
            </div>

            {/* Telegram Mini App 提示 */}
            {!isTelegramWebApp && (
              <Alert variant="warning" className="bg-yellow-500/10 border-yellow-500/30">
                <AlertCircle className="h-4 w-4 text-yellow-500" />
                <AlertDescription className="text-yellow-200 text-sm">
                  To link your Telegram account, please use this dApp in Telegram Mini App.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-4">
          <Button
            variant="outline"
            onClick={handleClose}
            className="border-purple-500/30 text-purple-300 hover:bg-purple-500/20"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isLoading}
            className="bg-purple-500/20 text-purple-100 hover:bg-purple-500/30 backdrop-blur-sm"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ProfileSettingsModal(props: ProfileSettingsModalProps) {
  return (
    <Suspense fallback={null}>
      <ProfileSettingsModalInner {...props} />
    </Suspense>
  );
}
