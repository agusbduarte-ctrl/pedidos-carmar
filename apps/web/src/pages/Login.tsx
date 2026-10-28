import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { ApiError, authApi, type Sucursal } from "../lib/api";

type Modo = "admin" | "repositor";

function mensajeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "Ocurrió un error inesperado.";
}

function FormAdmin() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await login({ tipo: "email", email, password });
    } catch (err) {
      setError(mensajeError(err));
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar}>
      <label>
        Correo
        <input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      <label>
        Clave
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="boton" type="submit" disabled={enviando}>
        {enviando ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}

function FormRepositor() {
  const { login } = useAuth();
  const [sucursal, setSucursal] = useState<Sucursal | "">("");
  const [usuarioId, setUsuarioId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const lista = useQuery({
    queryKey: ["auth", "repositores", sucursal],
    queryFn: () => authApi.repositores(sucursal as Sucursal),
    enabled: sucursal !== "",
  });

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    try {
      await login({ tipo: "repositor", usuarioId, pin });
    } catch (err) {
      setError(mensajeError(err));
      setPin("");
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar}>
      <label>
        Sucursal
        <select
          value={sucursal}
          onChange={(e) => {
            setSucursal(e.target.value as Sucursal | "");
            setUsuarioId("");
          }}
          required
        >
          <option value="">Elegí la sucursal</option>
          <option value="CARMAR_1">Cármar 1</option>
          <option value="CARMAR_2">Cármar 2</option>
        </select>
      </label>
      <label>
        Nombre
        <select
          value={usuarioId}
          onChange={(e) => setUsuarioId(e.target.value)}
          disabled={sucursal === "" || lista.isPending}
          required
        >
          <option value="">{lista.isFetching ? "Cargando..." : "Elegí tu nombre"}</option>
          {lista.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
      </label>
      {lista.isError && (
        <p className="error" role="alert">
          {mensajeError(lista.error)}
        </p>
      )}
      <label>
        PIN
        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          required
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="boton" type="submit" disabled={enviando || usuarioId === ""}>
        {enviando ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}

export default function Login() {
  const { user, cargando } = useAuth();
  const [modo, setModo] = useState<Modo>("repositor");

  if (cargando) return <p className="estado">Cargando...</p>;
  if (user) return <Navigate to="/" replace />;

  return (
    <main className="pagina">
      <h1>Pedidos Cármar</h1>
      <div className="pestanas" role="tablist">
        <button
          role="tab"
          aria-selected={modo === "repositor"}
          className={modo === "repositor" ? "activa" : ""}
          onClick={() => setModo("repositor")}
        >
          Repositor
        </button>
        <button
          role="tab"
          aria-selected={modo === "admin"}
          className={modo === "admin" ? "activa" : ""}
          onClick={() => setModo("admin")}
        >
          Administración
        </button>
      </div>
      {modo === "admin" ? <FormAdmin /> : <FormRepositor />}
    </main>
  );
}
