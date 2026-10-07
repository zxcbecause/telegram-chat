import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { LoginScreen } from './components/LoginScreen';
import { Messenger } from './components/Messenger';
import { useSession } from './hooks/useSession';
import { useTheme } from './hooks/useTheme';

export default function App() {
  const { session, client, login, logout } = useSession();
  const { pref, cycle } = useTheme();

  return (
    // reducedMotion="user": animations are disabled for people with prefers-reduced-motion.
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait">
        {session && client ? (
          <motion.div
            key={`chat-${session.credentials.idInstance}`}
            className="root-pane"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Messenger
              client={client}
              idInstance={session.credentials.idInstance}
              persist={session.remember}
              theme={pref}
              onToggleTheme={cycle}
              onLogout={logout}
            />
          </motion.div>
        ) : (
          <motion.div key="login" className="root-pane" exit={{ opacity: 0, scale: 0.98 }}>
            <LoginScreen onLogin={login} />
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
