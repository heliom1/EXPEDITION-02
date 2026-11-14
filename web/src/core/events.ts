/** Minimal typed event bus used to decouple simulation from UI. */
export type GameEventMap = {
  objective: { id: string };
  record: { id: string };
  notice: { text: string; tone?: 'info' | 'warn' | 'good' };
  drill: { progress: number; state: 'idle' | 'running' | 'done' };
  endOfBuild: Record<string, never>;
};

type Handler<T> = (payload: T) => void;

export class EventBus {
  private handlers = new Map<keyof GameEventMap, Set<Handler<never>>>();

  on<K extends keyof GameEventMap>(type: K, fn: Handler<GameEventMap[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(fn as Handler<never>);
    return () => set!.delete(fn as Handler<never>);
  }

  emit<K extends keyof GameEventMap>(type: K, payload: GameEventMap[K]): void {
    this.handlers.get(type)?.forEach((fn) => (fn as Handler<GameEventMap[K]>)(payload));
  }
}

export const events = new EventBus();
