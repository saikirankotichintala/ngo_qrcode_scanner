export default function QueueSummary({ stats }) {
  return (
    <div className="trace-summary-grid">
      <p>
        <strong>Total Actions:</strong> <span>{stats.total}</span>
      </p>
      <p>
        <strong>Pending:</strong> <span>{stats.pending}</span>
      </p>
      <p>
        <strong>Synced:</strong> <span>{stats.synced}</span>
      </p>
      <p>
        <strong>Blocked:</strong> <span>{stats.blocked}</span>
      </p>
    </div>
  );
}
