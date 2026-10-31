"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  KeyRound,
  X,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { Field } from "./ui";
import { useAtmosphere } from "../components/garden/atmosphere";

export default function Login({
  onSuccess,
}: {
  onSuccess: () => Promise<void>;
}) {
  const { setVisitor } = useAtmosphere();
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setVisitor(true);
    const show = () => setOpen(true);
    window.addEventListener("nhip-open-login", show);
    return () => { setVisitor(false); window.removeEventListener("nhip-open-login", show); };
  }, [setVisitor]);
  useEffect(() => {
    if (open) dialog.current?.showModal(); else dialog.current?.close();
  }, [open]);
  const [register, setRegister] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (register && data.password !== data.confirm) {
      setError("Hai mật khẩu chưa trùng nhau.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: register ? "register" : "login", data }),
      });
      const result = (await r.json()) as { error?: string };
      if (!r.ok) throw new Error(result.error || "Không đăng nhập được.");
      await onSuccess();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Không kết nối được. Thử lại nhé.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="native-login sylva-login">
      <button className="sylva-login-entry" type="button" onClick={() => setOpen(true)}>Đăng nhập <ArrowRight size={17} /></button>
      <dialog className="sylva-auth-dialog" ref={dialog} onCancel={() => setOpen(false)} onClose={() => setOpen(false)} aria-labelledby="login-heading">
      <button className="sylva-dialog-close" type="button" aria-label="Đóng đăng nhập" onClick={() => setOpen(false)}><X size={22} /></button>
      <section className="login-form-side">
        <div className="login-form-card">
          <div className="login-key">
            <KeyRound size={25} />
          </div>
          <span className="eyebrow">KHÔNG GIAN CLB CỦA BẠN</span>
          <h2 id="login-heading">{register ? "Bắt đầu một nhịp mới." : "Chào mừng trở lại."}</h2>
          <p>
            {register
              ? "Tạo tài khoản thành viên bằng MSSV và họ tên."
              : "Đăng nhập bằng tài khoản CLB để tiếp tục."}
          </p>
          <form key={String(register)} onSubmit={submit}>
            {register ? (
              <>
                <Field label="Họ và tên">
                  <input
                    name="name"
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={100}
                    placeholder="Nguyễn Minh Anh"
                  />
                </Field>
                <Field label="Mã số sinh viên">
                  <input
                    name="studentId"
                    autoComplete="username"
                    required
                    minLength={3}
                    maxLength={30}
                    placeholder="Nhập MSSV của bạn"
                  />
                </Field>
              </>
            ) : (
              <Field label="MSSV hoặc tên đăng nhập">
                <input
                  name="login"
                  autoComplete="username"
                  required
                  placeholder="Nhập MSSV hoặc tên đăng nhập"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </Field>
            )}
            <Field label="Mật khẩu">
              <input
                type="password"
                name="password"
                autoComplete={register ? "new-password" : "current-password"}
                required
                minLength={8}
                maxLength={128}
                placeholder={register ? "Tối thiểu 8 ký tự" : "Nhập mật khẩu"}
              />
            </Field>
            {register ? (
              <Field label="Nhập lại mật khẩu">
                <input
                  type="password"
                  name="confirm"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={128}
                  placeholder="Xác nhận mật khẩu"
                />
              </Field>
            ) : (
              <button
                className="forgot-password"
                type="button"
                onClick={() =>
                  setError(
                    "Liên hệ BCS để được cấp lại mật khẩu, sau đó bạn có thể tự đổi trong menu tài khoản.",
                  )
                }
              >
                Quên mật khẩu?
              </button>
            )}
            {error ? (
              <div className="login-error" role="alert">
                {error}
              </div>
            ) : null}
            <button
              type="submit"
              className="btn primary login-submit"
              disabled={busy}
            >
              {busy ? <LoaderCircle size={17} className="spin" /> : null}
              {register ? "Tạo tài khoản thành viên" : "Đăng nhập"}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="login-toggle">
            {register ? "Đã có tài khoản?" : "Thành viên mới?"}
            <button
              type="button"
              onClick={() => {
                setRegister(!register);
                setError("");
              }}
            >
              {register ? "Đăng nhập" : "Đăng ký bằng MSSV"}
            </button>
          </div>
          <div className="login-native-note">
            <ShieldCheck size={15} />
            <span>Tài khoản riêng của CLB · Không cần đăng nhập OpenAI</span>
          </div>
        </div>
        <span className="login-bottom-note">
          Họp tuần · Lịch trực C1 · Ghi nhận đóng góp
        </span>
      </section>
      </dialog>
    </main>
  );
}
