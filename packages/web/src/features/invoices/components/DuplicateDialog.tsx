import { Dialog } from "../../../components/ui/Dialog";
import { Button } from "../../../components/ui/Button";

interface DuplicateDialogProps {
  open: boolean;
  filename: string;
  existingId: number;
  existingName: string;
  onViewExisting: () => void;
  onCancel: () => void;
}

export function DuplicateDialog({ open, filename, existingId: _existingId, existingName, onViewExisting, onCancel }: DuplicateDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title="Duplicate Detected"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={onViewExisting}>View Existing</Button>
        </>
      }
    >
      <p className="text-sm text-gray-600">
        <span className="font-medium">{filename}</span> has already been uploaded as{" "}
        <span className="font-medium">{existingName}</span>.
      </p>
    </Dialog>
  );
}
