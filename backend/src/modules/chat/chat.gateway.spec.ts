import { ChatGateway } from './chat.gateway.js';
import type { ChatService } from './chat.service.js';
import type { SupabaseTokenVerifierService } from '../auth/supabase-token-verifier.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import type { ChatMessage } from './chat.types.js';

describe('ChatGateway', () => {
  let gateway: ChatGateway;
  let chatService: {
    authorizeMember: ReturnType<typeof vi.fn>;
    saveMessage: ReturnType<typeof vi.fn>;
  };
  let tokenVerifier: {
    verify: ReturnType<typeof vi.fn>;
  };
  let serverMock: {
    to: ReturnType<typeof vi.fn>;
  };
  let roomEmitMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    roomEmitMock = vi.fn();
    serverMock = {
      to: vi.fn().mockReturnValue({ emit: roomEmitMock }),
    };

    chatService = {
      authorizeMember: vi.fn(),
      saveMessage: vi.fn(),
    };

    tokenVerifier = {
      verify: vi.fn(),
    };

    gateway = new ChatGateway(
      chatService as unknown as ChatService,
      tokenVerifier as unknown as SupabaseTokenVerifierService,
    );
    gateway.server = serverMock as any;
  });

  describe('handleConnection', () => {
    it('accepts connection when valid token is provided in auth payload', async () => {
      const verifiedUser: AuthenticatedUser = {
        userId: 'verified-user-1',
        email: 'user@example.com',
      };
      tokenVerifier.verify.mockResolvedValue(verifiedUser);

      const client: any = {
        id: 'socket-1',
        handshake: { auth: { token: 'valid-jwt-token' } },
        data: {},
        emit: vi.fn(),
        disconnect: vi.fn(),
      };

      await gateway.handleConnection(client);

      expect(tokenVerifier.verify).toHaveBeenCalledWith('valid-jwt-token');
      expect(client.data.user).toEqual({
        userId: 'verified-user-1',
        email: 'user@example.com',
      });
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('rejects and disconnects socket when token is missing', async () => {
      const client: any = {
        id: 'socket-2',
        handshake: { auth: {}, headers: {} },
        data: {},
        emit: vi.fn(),
        disconnect: vi.fn(),
      };

      await gateway.handleConnection(client);

      expect(client.emit).toHaveBeenCalledWith('chat:error', expect.any(Object));
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('rejects and disconnects socket when token verification fails', async () => {
      tokenVerifier.verify.mockRejectedValue(new Error('Invalid token'));

      const client: any = {
        id: 'socket-3',
        handshake: { auth: { token: 'bad-token' } },
        data: {},
        emit: vi.fn(),
        disconnect: vi.fn(),
      };

      await gateway.handleConnection(client);

      expect(client.emit).toHaveBeenCalledWith('chat:error', expect.any(Object));
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('handleJoinActivity', () => {
    it('joins activity room after successful membership authorization', async () => {
      chatService.authorizeMember.mockResolvedValue({
        profileId: 'prof-1',
        displayName: 'User 1',
        isHost: true,
      });

      const client: any = {
        data: { user: { userId: 'user-1' } },
        join: vi.fn(),
      };

      const result = await gateway.handleJoinActivity(client, {
        activityId: 'act-1',
      });

      expect(chatService.authorizeMember).toHaveBeenCalledWith('act-1', 'user-1');
      expect(client.join).toHaveBeenCalledWith('activity:act-1');
      expect(result).toEqual({ status: 'joined', activityId: 'act-1' });
    });

    it('returns error and does not join room if unauthorized', async () => {
      chatService.authorizeMember.mockRejectedValue(
        new Error('Only approved members can access chat'),
      );

      const client: any = {
        data: { user: { userId: 'unapproved-user' } },
        join: vi.fn(),
      };

      const result = await gateway.handleJoinActivity(client, {
        activityId: 'act-1',
      });

      expect(client.join).not.toHaveBeenCalled();
      expect(result).toEqual({ error: 'Only approved members can access chat' });
    });
  });

  describe('handleSendMessage', () => {
    it('persists message in DB first then broadcasts to room', async () => {
      const savedMessage: ChatMessage = {
        messageId: 'msg-1',
        activityId: 'act-1',
        senderId: 'prof-1',
        senderSupabaseUserId: 'user-1',
        senderName: 'User 1',
        senderAvatarUrl: null,
        content: 'Hello everyone!',
        createdAt: '2026-10-13T12:00:00.000Z',
      };
      chatService.saveMessage.mockResolvedValue(savedMessage);

      const client: any = {
        data: { user: { userId: 'user-1', email: 'user@example.com' } },
      };

      const result = await gateway.handleSendMessage(client, {
        activityId: 'act-1',
        content: 'Hello everyone!',
      });

      expect(chatService.saveMessage).toHaveBeenCalledWith(
        'act-1',
        { userId: 'user-1', email: 'user@example.com' },
        'Hello everyone!',
      );
      expect(serverMock.to).toHaveBeenCalledWith('activity:act-1');
      expect(roomEmitMock).toHaveBeenCalledWith('new_message', savedMessage);
      expect(result).toEqual({ status: 'sent', message: savedMessage });
    });

    it('does not broadcast if database write fails', async () => {
      chatService.saveMessage.mockRejectedValue(new Error('DB failure'));

      const client: any = {
        data: { user: { userId: 'user-1' } },
      };

      const result = await gateway.handleSendMessage(client, {
        activityId: 'act-1',
        content: 'Failed attempt',
      });

      expect(serverMock.to).not.toHaveBeenCalled();
      expect(roomEmitMock).not.toHaveBeenCalled();
      expect(result).toEqual({ error: 'DB failure' });
    });
  });
});
