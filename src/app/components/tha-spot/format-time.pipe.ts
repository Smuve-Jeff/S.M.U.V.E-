import { Pipe, PipeTransform } from '@angular/core';

/**
 * Session-elapsed formatting for the game console footer. The console
 * template has always bound `gameSessionElapsed() | formatTime`, but the pipe
 * was never declared — Angular threw NG0302 on first render of the cabinet
 * overlay, so inline games (retro emulators, WebGL, first-party WASM) never
 * mounted their iframe. Mirrors the MM:SS convention used by the audio
 * recorder (hours are added only when elapsed time exceeds an hour).
 */
@Pipe({ name: 'formatTime', standalone: true })
export class FormatTimePipe implements PipeTransform {
  transform(value: number | null | undefined): string {
    const total = Math.max(0, Math.floor(Number(value) || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
  }
}
