"use client";
import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  LoaderCircle,
} from "lucide-react";
import { Brand, Field } from "./ui";

export default function Login({
  onSuccess,
}: {
  onSuccess: () => Promise<void>;
}) {
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
    <main className="entry-login">
      <header className="entry-masthead"><Brand /><span>HỌP TUẦN & LỊCH TRỰC C1</span></header>
      <div className="entry-login-layout">
      <section className="entry-intro" aria-labelledby="club-heading">
        <span className="eyebrow">KẾT NỐI · THAM GIA · ĐÓNG GÓP</span>
        <h1 id="club-heading">Cùng một nhịp.</h1>
        <p>Lịch họp, ca trực và hoạt động thành viên.<br />Tất cả trong một không gian chung.</p>
      </section>
      <section className="login-form-side" aria-labelledby="login-heading">
        <div className="login-form-card">
          <span className="eyebrow">TÀI KHOẢN THÀNH VIÊN</span>
          <h2 id="login-heading">{register ? "Đăng ký thành viên" : "Đăng nhập"}</h2>
          <p>
            {register
              ? "Tạo tài khoản thành viên bằng MSSV và họ tên."
              : "Sử dụng tài khoản được BĐH cung cấp."}
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
                    "Liên hệ BĐH để được cấp lại mật khẩu, sau đó bạn có thể tự đổi trong menu tài khoản.",
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
        </div>
      </section>
      </div>
      <footer className="entry-login-footer"><span>Nhịp CLB</span><span>Không gian hoạt động thành viên</span></footer>
    </main>
  );
}
