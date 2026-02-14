import {
    Button,
    Dialog,
    DialogSurface,
    DialogBody,
    DialogTitle,
    DialogContent,
    DialogActions,
} from "@fluentui/react-components";

interface UnsavedChangesDialogProps {
    open: boolean;
    onDiscard: () => void;
    onCancel: () => void;
    message?: string;
    discardLabel?: string;
}

export function UnsavedChangesDialog({
    open,
    onDiscard,
    onCancel,
    message = "You have unsaved changes. Loading another test will discard them.",
    discardLabel = "Discard & Continue",
}: UnsavedChangesDialogProps) {
    return (
        <Dialog open={open} onOpenChange={(_e, data) => { if (!data.open) onCancel(); }}>
            <DialogSurface>
                <DialogBody>
                    <DialogTitle>Unsaved Changes</DialogTitle>
                    <DialogContent>{message}</DialogContent>
                    <DialogActions>
                        <Button appearance="secondary" onClick={onCancel}>Cancel</Button>
                        <Button appearance="primary" onClick={onDiscard}>{discardLabel}</Button>
                    </DialogActions>
                </DialogBody>
            </DialogSurface>
        </Dialog>
    );
}
