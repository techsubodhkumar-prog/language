export interface ChatMessage {
  messageId: string;
  activityId: string;
  senderId: string;
  senderSupabaseUserId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  content: string;
  createdAt: string;
}

export interface ChatHistoryResponse {
  items: ChatMessage[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

export interface ChatMemberAuthorization {
  profileId: string;
  displayName: string;
  avatarUrl: string | null;
  isHost: boolean;
}
