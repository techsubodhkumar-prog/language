export type NotificationType =
  | 'join_request'
  | 'request_approved'
  | 'request_rejected'
  | 'activity_cancelled'
  | 'activity_updated'
  | 'activity_reminder'
  | 'chat_message'
  | 'system';

export interface NotificationRecord {
  notificationId: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  activityId: string | null;
  referenceId: string | null;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
  isRead: boolean;
}

export interface NotificationListResponse {
  items: NotificationRecord[];
  unreadCount: number;
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

export interface UnreadCountResponse {
  unreadCount: number;
}
