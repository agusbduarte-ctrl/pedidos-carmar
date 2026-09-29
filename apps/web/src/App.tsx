import { useEffect, useState } from "react";

export default function App() {
  const [status, setStatus] = useState("...");

  useEffect(() => {
    fetch("http://localhost:3000/health")
      .then((r) => r.json())
      .then((d) => setStatus(d.status))
      .catch(() => setStatus("error"));
  }, []);

  return (
    <div style={{ fontFamily: "sans-serif", padding: 40 }}>
      <h1>Pedidos Cármar</h1>
      <p>API: {status}</p>
    </div>
  );
}
