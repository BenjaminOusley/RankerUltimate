import { Button } from '@/shared/components/Button/Button';
import { Modal } from '@/shared/components/Modal/Modal';
import styles from './ExitConfirmModal.module.css';

type ExitConfirmModalProps = {
  open: boolean;
  onStay: () => void;
  onExit: () => void;
};

export function ExitConfirmModal({ open, onStay, onExit }: ExitConfirmModalProps) {
  return (
    <Modal open={open} className={styles.modal} aria-labelledby="exit-title">
      <h2 id="exit-title">Return to Main Menu?</h2>
      <p>This ranking isn’t being saved as a completed ranking yet. Leaving will discard it.</p>
      <div className={styles.actions}>
        <Button onClick={onStay}>Stay Here</Button>
        <Button variant="danger" onClick={onExit}>
          Discard &amp; Exit
        </Button>
      </div>
    </Modal>
  );
}
