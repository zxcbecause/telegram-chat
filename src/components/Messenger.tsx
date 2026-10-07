import { AnimatePresence, motion } from 'framer-motion';
import type { GreenApiClient } from '../api/greenApi';
import { useChat } from '../hooks/useChat';
import type { ThemePref } from '../hooks/useTheme';
import { ChatView } from './ChatView';
import { MaxLogo } from './icons';
import { Sidebar } from './Sidebar';

interface Props {
  client: GreenApiClient;
  idInstance: string;
  persist: boolean;
  theme: ThemePref;
  onToggleTheme: () => void;
  onLogout: () => void;
}

export function Messenger({ client, idInstance, persist, theme, onToggleTheme, onLogout }: Props) {
  const api = useChat(client, idInstance, persist);
  const { activeChat } = api;

  return (
    <div className={`app ${activeChat ? 'has-chat' : ''}`}>
      <Sidebar
        chats={api.chats}
        activeChatId={activeChat?.chatId ?? null}
        connection={api.connection}
        theme={theme}
        onToggleTheme={onToggleTheme}
        onLogout={onLogout}
        onSelect={api.selectChat}
        onCreate={api.openChatByPhone}
      />

      <main className="app__main">
        <AnimatePresence mode="wait" initial={false}>
          {activeChat ? (
            <motion.div
              key={activeChat.chatId}
              className="app__pane"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <ChatView
                chat={activeChat}
                api={api}
                instanceState={api.instanceState}
                onBack={() => api.selectChat(null)}
              />
            </motion.div>
          ) : (
            <motion.div
              key="placeholder"
              className="app__pane placeholder"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <MaxLogo size={72} />
              <p>Выберите чат или создайте новый по номеру телефона</p>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
