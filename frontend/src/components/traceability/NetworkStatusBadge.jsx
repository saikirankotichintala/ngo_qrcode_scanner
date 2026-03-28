export default function NetworkStatusBadge({ isOnline }) {
  return (
    <p className={`trace-network-pill ${isOnline ? "online" : "offline"}`}>
      {isOnline ? "ONLINE: Auto-sync active" : "OFFLINE: Actions queued locally"}
    </p>
  );
}
