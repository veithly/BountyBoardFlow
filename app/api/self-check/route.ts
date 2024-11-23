import { keccak256, encodeAbiParameters, parseAbiParameters, SignableMessage } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { lineaSepolia, Chain } from 'viem/chains';
import anvil from '@/providers/my-anvil';
import contractAddress from '@/constants/contract-address';
import abi from '@/constants/BountyBoard.json';
import { TaskDetailView } from '@/types/types';
import { AIReviewService } from '@/services/aiReview';

const SIGNER_PRIVATE_KEY = process.env.SIGNER_ADDRESS_PRIVATE_KEY as `0x${string}`;

// 支持的链配置
const SUPPORTED_CHAINS: Record<string, Chain> = {
  'Linea Sepolia Testnet': lineaSepolia,
  'Anvil': anvil,
};

const aiReviewService = new AIReviewService();

export async function POST(req: NextRequest) {
  try {
    const { boardId, taskId, address, proof, chainName } = await req.json();

    // 验证参数
    if (!boardId || !taskId || !address || !proof || !chainName) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // 获取对应链的配置
    const chain = SUPPORTED_CHAINS[chainName];
    if (!chain) {
      return NextResponse.json(
        { error: 'Unsupported chain' },
        { status: 400 }
      );
    }

    // 获取对应链的合约地址
    const contractAddr = contractAddress.BountyBoard[chain.name as keyof typeof contractAddress.BountyBoard];
    if (!contractAddr) {
      return NextResponse.json(
        { error: 'Contract not deployed on this chain' },
        { status: 400 }
      );
    }

    // 创建对应链的客户端
    const publicClient = createPublicClient({
      chain,
      transport: http()
    });

    // 获取任务详情进行验证
    const task = await publicClient.readContract({
      address: contractAddr as `0x${string}`,
      abi,
      functionName: 'getTaskDetail',
      args: [BigInt(boardId), BigInt(taskId)]
    }) as TaskDetailView;

    // 验证任务是否允许自检
    if (!task.allowSelfCheck) {
      return NextResponse.json(
        { error: 'Task does not allow self-check' },
        { status: 400 }
      );
    }

    let checkData = proof;

    // 如果任务配置中启用了 AI Review
    const taskConfig = JSON.parse(task.config || '{}');
    if (taskConfig.aiReview) {
      const aiReviewResult = await aiReviewService.review({
        taskConfig,
        proofTypes: taskConfig.taskType,
        proofData: JSON.parse(proof),
        taskDescription: task.description,
        aiReviewPrompt: taskConfig.aiReviewPrompt
      });

      if (!aiReviewResult.approved) {
        return NextResponse.json(
          { error: aiReviewResult.reviewComment },
          { status: 400 }
        );
      }

      checkData = aiReviewResult.reviewComment
    }

    // 构造消息
    const message = encodeAbiParameters(
      parseAbiParameters('uint256, uint256, address, string'),
      [BigInt(boardId), BigInt(taskId), address as `0x${string}`, checkData]
    );

    // 计算消息哈希
    const messageHash = keccak256(message);

    // 验证私钥格式
    if (!SIGNER_PRIVATE_KEY || !SIGNER_PRIVATE_KEY.startsWith('0x') || SIGNER_PRIVATE_KEY.length !== 66) {
      throw new Error('Invalid SIGNER_PRIVATE_KEY format');
    }

    const account = privateKeyToAccount(SIGNER_PRIVATE_KEY);

    // 签名消息
    const signature = await account.signMessage({
      message: { raw: messageHash } as SignableMessage
    });

    return NextResponse.json({ signature, checkData });
  } catch (error) {
    console.error('Error in self-check:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}