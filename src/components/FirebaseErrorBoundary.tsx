import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class FirebaseErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    message: '',
  };

  public static getDerivedStateFromError(error: Error): State {
    let displayMsg = error.message || 'Unexpected application error.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string; operationType?: string };
      if (parsed && parsed.error) {
        displayMsg = `${parsed.operationType ? `[${parsed.operationType}] ` : ''}${parsed.error}`;
      }
    } catch {
      // keep raw message
    }
    return { hasError: true, message: displayMsg };
  }

  public componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Chatly ErrorBoundary caught:', error, info);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#071522] text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-3xl border border-cyan-500/25 bg-[#0C2134] p-6 space-y-4 text-center shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-400 mx-auto flex items-center justify-center">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h1 className="font-display text-lg font-bold text-white">
              Something went wrong · حدث خطأ غير متوقع
            </h1>
            <p className="text-xs text-slate-300 leading-relaxed break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reload Chatly · إعادة التحميل</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
