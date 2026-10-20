import { describe, it, expect, vi } from 'vitest';
import {
  CommandRegistry,
  CommentatorEngine,
  MockChatProvider,
  ChatManager
} from '@autoplay/chat-interactivity';
import { MockMinecraftAdapter } from '@autoplay/adapter-minecraft-java';

describe('Chat Interactivity & Viewer Commands', () => {
  it('CommandRegistry should return help message for !help', async () => {
    const registry = new CommandRegistry();
    const result = await registry.execute('!help', 'Tester');
    expect(result).not.toBeNull();
    expect(result?.success).toBe(true);
    expect(result?.message).toContain('Available commands');
  });

  it('CommandRegistry should enforce per-user cooldowns', async () => {
    const registry = new CommandRegistry(0, 5000);
    const mockAdapter = new MockMinecraftAdapter();

    const first = await registry.execute('!jump', 'SpammerUser', mockAdapter);
    expect(first?.success).toBe(true);

    const second = await registry.execute('!jump', 'SpammerUser', mockAdapter);
    expect(second?.success).toBe(false);
    expect(second?.message).toContain('please wait');
  });

  it('CommandRegistry should sanitize argument inputs', async () => {
    const registry = new CommandRegistry(0, 0);
    const mockAdapter = new MockMinecraftAdapter();

    const result = await registry.execute('!say <script>alert(1)</script>hello', 'User1', mockAdapter);
    expect(result?.success).toBe(true);
    expect(result?.message).not.toContain('<script>');
  });

  it('CommentatorEngine should generate dynamic speech and log history', () => {
    const commentator = new CommentatorEngine({ minIntervalSeconds: 0 });
    const item = commentator.speak('Look at that sunrise over the mountain!', 'excited');

    expect(item.text).toBe('Look at that sunrise over the mountain!');
    expect(item.mood).toBe('excited');
    expect(commentator.getHistory().length).toBeGreaterThan(0);
  });

  it('MockChatProvider should correctly tag commands and viewer badges', () => {
    const provider = new MockChatProvider();
    const msg = provider.injectMessage('ViewerX', '!coords', 'sponsor');

    expect(msg.isCommand).toBe(true);
    expect(msg.badge).toBe('sponsor');
    expect(msg.author).toBe('ViewerX');
  });

  it('ChatManager should coordinate provider, commands, and adapter execution', async () => {
    const chatManager = new ChatManager();
    const mockAdapter = new MockMinecraftAdapter();
    chatManager.setActiveAdapter(mockAdapter);

    let commandEmitted = false;
    chatManager.on('chat:command', (payload) => {
      commandEmitted = true;
      expect(payload.message.author).toBe('SuperFan');
      expect(payload.result.success).toBe(true);
    });

    chatManager.injectMessage('SuperFan', '!jump');
    await new Promise((r) => setTimeout(r, 50));
    expect(commandEmitted).toBe(true);
  });

  it('extractYouTubeVideoId should parse different URL styles', async () => {
    const { extractYouTubeVideoId } = await import('@autoplay/chat-interactivity');
    expect(extractYouTubeVideoId('jfKfPfyJRdk')).toBe('jfKfPfyJRdk');
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=jfKfPfyJRdk')).toBe('jfKfPfyJRdk');
    expect(extractYouTubeVideoId('https://youtu.be/jfKfPfyJRdk')).toBe('jfKfPfyJRdk');
    expect(extractYouTubeVideoId('https://www.youtube.com/live/jfKfPfyJRdk?feature=share')).toBe('jfKfPfyJRdk');
  });

  it('YouTubeLiveChatProvider should format messages with YouTube badges and super chats', async () => {
    const { YouTubeLiveChatProvider } = await import('@autoplay/chat-interactivity');
    const yt = new YouTubeLiveChatProvider({ videoId: 'jfKfPfyJRdk' });

    let received: any = null;
    yt.on('message', (msg) => {
      received = msg;
    });

    const msg = yt.injectMessage('GoldenFan', 'Great stream!', 'owner', 'https://avatar.com/1.jpg', '$20.00');
    expect(msg.author).toBe('GoldenFan');
    expect(msg.badge).toBe('owner');
    expect(msg.source).toBe('youtube');
    expect(msg.superChatAmount).toBe('$20.00');
    expect(msg.authorPhotoUrl).toBe('https://avatar.com/1.jpg');
    expect(received).toEqual(msg);
  });

  it('ChatManager should switch to YouTube chat and report status', async () => {
    const chatManager = new ChatManager();
    await chatManager.connectYouTube({ videoId: 'jfKfPfyJRdk' });

    const status = chatManager.getStatus();
    expect(status.isYouTube).toBe(true);
    expect(status.providerId).toBe('youtube-live-chat');
    expect(status.details?.videoId).toBe('jfKfPfyJRdk');
  });
});

