'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import EmojiPicker from 'emoji-picker-react';
import styles from './chat.module.css';
import CallModal from '@/components/CallModal';

interface Message {
  id: number;
  sender_id: number;
  sender_username: string;
  content: string;
  image?: string;
  timestamp: string;
}

interface Participant {
  id: number;
  username: string;
  email: string;
}

interface Conversation {
  id: number;
  participants: Participant[];
  last_message: { content: string; timestamp: string } | null;
  updated_at: string;
}

interface SearchUser {
  id: number;
  username: string;
  email: string;
}

const API = process.env.NEXT_PUBLIC_API_URL;

function getInitials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

function getOtherParticipant(conv: Conversation, myId: number): Participant | undefined {
  return conv.participants.find(p => p.id !== myId);
}

function formatTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ChatPage() {
  const { user, token, logout } = useAuth();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) router.push('/login');
  }, [token, router]);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`${API}/api/chat/conversations/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      setConversations(data);
    }
  }, [token]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Search users
  useEffect(() => {
    if (!searchQuery.trim() || !token) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await fetch(`${API}/api/chat/users/search/?q=${searchQuery}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setSearchResults(await res.json());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, token]);

  // Load messages for active conversation
  useEffect(() => {
    if (!activeConv || !token) return;

    // Load history
    fetch(`${API}/api/chat/conversations/${activeConv.id}/messages/`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(res => res.json()).then(data => {
      setMessages(data.map((m: any) => ({
        id: m.id,
        sender_id: m.sender.id,
        sender_username: m.sender.username,
        content: m.content,
        image: m.image,
        timestamp: m.timestamp,
      })));
    });

    // WebSocket
    if (socketRef.current) socketRef.current.close();
    const ws = new WebSocket(`${process.env.NEXT_PUBLIC_WS_URL}/ws/chat/${activeConv.id}/`);
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      setMessages(prev => [...prev, {
        id: data.message_id,
        sender_id: data.sender_id,
        sender_username: data.sender_username,
        content: data.message,
        image: data.image,
        timestamp: data.timestamp,
      }]);
      fetchConversations();
    };
    socketRef.current = ws;
    return () => ws.close();
  }, [activeConv, token, fetchConversations]);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close search on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearch(false);
        setSearchQuery('');
        setSearchResults([]);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const startConversation = async (otherUser: SearchUser) => {
    if (!token) return;
    const res = await fetch(`${API}/api/chat/conversations/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: otherUser.id }),
    });
    if (res.ok) {
      const conv = await res.json();
      await fetchConversations();
      setActiveConv(conv);
      setShowSearch(false);
      setSearchQuery('');
      setSearchResults([]);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeConv || !token) return;
    if (!input.trim() && !selectedImage) return;

    if (selectedImage) {
      const formData = new FormData();
      formData.append('image', selectedImage);
      if (input.trim()) formData.append('content', input.trim());

      const res = await fetch(`${API}/api/chat/conversations/${activeConv.id}/upload_image/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (res.ok) {
        setInput('');
        setSelectedImage(null);
      }
    } else {
      if (!socketRef.current) return;
      socketRef.current.send(JSON.stringify({
        message: input.trim(),
        sender_id: user.id,
      }));
      setInput('');
    }
  };

  if (!user) return null;

  const otherPerson = activeConv ? getOtherParticipant(activeConv, user.id) : null;

  return (
    <div className={styles.layout}>
      {/* ── Sidebar ── */}
      <aside className={styles.sidebar}>
        {/* App Header */}
        <div className={styles.sidebarHeader}>
          <div className={styles.appName}>MyChat</div>
          <div className={styles.headerIcons}>
            <button
              className={styles.iconBtn}
              onClick={() => setShowSearch(s => !s)}
              title="New conversation"
              id="new-conversation-btn"
            >
              +
            </button>
            <button className={styles.iconBtn} onClick={logout} title="Logout" id="logout-btn">
              ⎋
            </button>
          </div>
        </div>

        {/* User Profile */}
        <div className={styles.userProfile}>
          <div className={styles.avatar} style={{ background: '#6366f1' }}>
            {getInitials(user.username)}
          </div>
          <div className={styles.userInfo}>
            <span className={styles.userName}>{user.username}</span>
            <span className={styles.userEmail}>{user.email}</span>
          </div>
          <span className={styles.onlineDot} />
        </div>

        {/* Search Overlay */}
        {showSearch && (
          <div className={styles.searchBox} ref={searchRef}>
            <input
              autoFocus
              type="text"
              placeholder="Search people..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className={styles.searchInput}
              id="user-search-input"
            />
            {searchResults.length > 0 && (
              <div className={styles.searchResults}>
                {searchResults.map(u => (
                  <div key={u.id} className={styles.searchResultItem} onClick={() => startConversation(u)}>
                    <div className={styles.avatarSm}>{getInitials(u.username)}</div>
                    <div>
                      <div className={styles.searchName}>{u.username}</div>
                      <div className={styles.searchEmail}>{u.email}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Conversation List */}
        <div className={styles.convSection}>
          <div className={styles.sectionLabel}>MESSAGES</div>
          {conversations.length === 0 ? (
            <div className={styles.emptyConvs}>
              <span>💬</span>
              <p>No conversations yet</p>
              <small>Click + to find people</small>
            </div>
          ) : (
            conversations.map(conv => {
              const other = getOtherParticipant(conv, user.id);
              if (!other) return null;
              return (
                <div
                  key={conv.id}
                  className={`${styles.convItem} ${activeConv?.id === conv.id ? styles.convItemActive : ''}`}
                  onClick={() => { setActiveConv(conv); setMessages([]); }}
                  id={`conv-${conv.id}`}
                >
                  <div className={styles.avatarSm}>{getInitials(other.username)}</div>
                  <div className={styles.convInfo}>
                    <div className={styles.convName}>{other.username}</div>
                    <div className={styles.convPreview}>
                      {conv.last_message ? conv.last_message.content : 'Start a conversation...'}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* ── Main Area ── */}
      <main className={styles.main}>
        {!activeConv ? (
          /* Empty State */
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>💬</div>
            <h2>Your Messages</h2>
            <p>Select a conversation from the sidebar<br />or start a new one</p>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className={styles.chatHeader}>
              <div className={styles.avatarMd}>{otherPerson ? getInitials(otherPerson.username) : '?'}</div>
              <div style={{ flex: 1 }}>
                <div className={styles.chatName}>{otherPerson?.username}</div>
                <div className={styles.chatStatus}>Online</div>
              </div>
              {otherPerson && user && token && (
                <CallModal
                  conversationId={activeConv.id}
                  currentUser={user}
                  otherUser={otherPerson}
                  token={token}
                />
              )}
            </div>

            {/* Messages */}
            <div className={styles.messages}>
              {messages.length === 0 && (
                <div className={styles.emptyChat}>
                  <div className={styles.emptyChatIcon}>👋</div>
                  <p>Say hi to <strong>{otherPerson?.username}</strong>!</p>
                </div>
              )}
              {messages.map((msg) => {
                const isMine = msg.sender_id === user.id;
                return (
                  <div key={msg.id} className={`${styles.msgRow} ${isMine ? styles.msgRowRight : styles.msgRowLeft}`}>
                    {!isMine && (
                      <div className={styles.avatarXs}>{getInitials(msg.sender_username)}</div>
                    )}
                    <div className={`${styles.bubble} ${isMine ? styles.bubbleMine : styles.bubbleTheirs}`}>
                      {msg.image && (
                        <img
                          src={msg.image.startsWith('http') ? msg.image : `${API}${msg.image}`}
                          alt="attachment"
                          className={styles.msgImage}
                        />
                      )}
                      {msg.content && <span>{msg.content}</span>}
                      <span className={styles.msgTime}>{formatTime(msg.timestamp)}</span>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className={styles.inputWrapper}>
              {showEmojiPicker && (
                <div className={styles.emojiPickerContainer}>
                  <EmojiPicker theme={'dark' as any} onEmojiClick={(e) => setInput(prev => prev + e.emoji)} />
                </div>
              )}

              {selectedImage && (
                <div className={styles.imagePreview}>
                  <img src={URL.createObjectURL(selectedImage)} alt="preview" />
                  <button onClick={() => setSelectedImage(null)}>✕</button>
                </div>
              )}
              <form className={styles.inputArea} onSubmit={sendMessage}>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                >
                  😀
                </button>
                <button
                  type="button"
                  className={styles.actionBtn}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                    <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                  </svg>
                </button>
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setSelectedImage(e.target.files[0]);
                    }
                  }}
                />
                <input
                  type="text"
                  placeholder={`Message ${otherPerson?.username}...`}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onFocus={() => setShowEmojiPicker(false)}
                  className={styles.msgInput}
                  id="message-input"
                />
                <button type="submit" className={styles.sendBtn} id="send-btn">
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                  </svg>
                </button>
              </form>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
