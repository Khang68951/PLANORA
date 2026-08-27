"use client";

import { Check, FileText, LoaderCircle, X, XCircle } from "lucide-react";

const documentCommands = new Set(["documents.update", "documents.insert", "documents.remove"]);

export default function AIApprovalReview({ run, workingId, onClose, onRunAction, onCommandAction, onReviewDocument }) {
  if (!run) return null;
  const pending = run.commands.filter((command) => command.status === "pending");
  const eligible = pending.filter((command) => !documentCommands.has(command.name));

  return (
    <div className="ai-review-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="ai-review-drawer" role="dialog" aria-modal="true" aria-labelledby="ai-review-title">
        <header className="ai-review-header">
          <div>
            <p className="eyebrow">Human review</p>
            <h2 id="ai-review-title">Proposed project changes</h2>
            <p>{run.summary}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close approval review"><X size={20} /></button>
        </header>
        <div className="ai-review-request">
          <strong>Your request</strong>
          <p>{run.requestMessage}</p>
        </div>
        <div className="ai-review-progress" aria-live="polite">
          <span><strong>{run.progress.applied}</strong> applied</span>
          <span><strong>{run.progress.decided}</strong> of {run.progress.total} decided</span>
          <progress value={run.progress.decided} max={Math.max(run.progress.total, 1)}>{run.progress.decided} of {run.progress.total}</progress>
        </div>
        <div className="ai-review-command-list">
          {run.commands.map((command, index) => {
            const isDocument = documentCommands.has(command.name);
            return (
              <article className={`ai-review-command status-${command.status}`} key={command.id}>
                <span className="ai-review-command-number">{index + 1}</span>
                <div>
                  <strong>{command.summary}</strong>
                  <small>{command.name} · {command.status}</small>
                  {command.error ? <p role="alert">{command.error}</p> : null}
                </div>
                {command.status === "pending" ? (
                  <div className="ai-review-command-actions">
                    <button className="secondary-button" type="button" disabled={workingId === command.id} onClick={() => onCommandAction(command, "discard")}><XCircle size={14} /> Reject</button>
                    {isDocument ? (
                      <button className="primary-button" type="button" disabled={workingId === command.id} onClick={() => onReviewDocument(command)}><FileText size={14} /> Compare in document</button>
                    ) : (
                      <button className="primary-button" type="button" disabled={workingId === command.id} onClick={() => onCommandAction(command, "approve")}>
                        {workingId === command.id ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />} Approve
                      </button>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
        <footer className="ai-review-footer">
          <button className="secondary-button" type="button" disabled={!pending.length || workingId === run.id} onClick={() => onRunAction(run, "reject_all")}>Reject all pending</button>
          <button className="primary-button" type="button" disabled={!eligible.length || workingId === run.id} onClick={() => onRunAction(run, "approve_all")}>
            {workingId === run.id ? "Applying…" : `Approve ${eligible.length} eligible`}
          </button>
        </footer>
        {pending.some((command) => documentCommands.has(command.name)) ? <p className="ai-review-note">Document text changes stay separate so you can compare highlighted text before approval.</p> : null}
      </section>
    </div>
  );
}
