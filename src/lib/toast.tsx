// =====================================================================
// エラー通知（トースト）共通モジュール（T-15）。
//
// Tauriコマンドがエラー（Result::Err）を返した場合に、ユーザーへ通知する
// 横断的な仕組み（R-NF-1）。画面はコマンド失敗を捕捉して `notifyError` を
// 呼び出すだけでよい。通知は画面右下に一定時間表示され、手動で閉じられる。
//
// 対応EARS: R-NF-1（コマンドエラーをユーザーに通知）。
// =====================================================================

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ToastKind = "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  /** コマンド失敗などのエラーを通知する（R-NF-1）。 */
  notifyError: (message: unknown) => void;
  /** 補助的な情報通知。 */
  notify: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** 自動消去までのミリ秒。 */
const AUTO_DISMISS_MS = 6000;

/** unknown なエラー値を表示用文字列に整える。 */
function toMessage(value: unknown): string {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  return String(value);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = Date.now() + Math.random();
      setToasts((current) => [...current, { id, kind, message }]);
      window.setTimeout(() => remove(id), AUTO_DISMISS_MS);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      notifyError: (message) => push("error", toMessage(message)),
      notify: (message) => push("info", message),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-container" role="region" aria-label="通知">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.kind}`}
            role={t.kind === "error" ? "alert" : "status"}
          >
            <span className="toast-message">{t.message}</span>
            <button
              type="button"
              className="toast-close"
              onClick={() => remove(t.id)}
              aria-label="通知を閉じる"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** トースト通知APIを取得する。`ToastProvider` の内側でのみ利用可能。 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast は ToastProvider の内側で使用してください。");
  }
  return ctx;
}
