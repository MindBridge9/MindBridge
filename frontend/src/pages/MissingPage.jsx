import { useNavigate } from 'react-router-dom';
import { Camera, FileWarning, Home } from 'lucide-react';
import { AppShell } from '../components/layout/AppShell';
import { Button, EmptyState } from '../components/common';

export function MissingPage({
  title = 'Page not available in this session',
  description = 'MindBridge keeps scanned pages locally in memory (or saved on this device when explicitly stored). Refreshing or opening an old link clears unsaved pages because there is no server page library.',
}) {
  const navigate = useNavigate();

  return (
    <AppShell>
      <div className="mb-shell-container py-12 max-w-[680px]">
        <EmptyState
          icon={FileWarning}
          title={title}
          description={description}
          actions={
            <>
              <Button variant="primary" icon={Camera} onClick={() => navigate('/scan')}>
                Scan a textbook page
              </Button>
              <Button variant="secondary" icon={Home} onClick={() => navigate('/')}>
                Back to Home
              </Button>
            </>
          }
        />
      </div>
    </AppShell>
  );
}
