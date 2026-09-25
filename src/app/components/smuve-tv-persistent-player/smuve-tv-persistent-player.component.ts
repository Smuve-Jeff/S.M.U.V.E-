import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SmuveTvPlaybackService } from '../../services/smuve-tv-playback.service';

/**
 * The shell-owned half of S.M.U.V.E. TV.
 *
 * The guide component can be destroyed by a route change, but this component
 * lives with the app shell. It therefore remains the owner of the one video
 * element while a viewer browses another workspace after popping out.
 */
@Component({
  selector: 'app-smuve-tv-persistent-player',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './smuve-tv-persistent-player.component.html',
  styleUrls: ['./smuve-tv-persistent-player.component.css'],
})
export class SmuveTvPersistentPlayerComponent
  implements AfterViewInit, OnDestroy
{
  readonly player = inject(SmuveTvPlaybackService);
  private readonly router = inject(Router);

  @ViewChild('persistentVideo', { static: true })
  private readonly videoRef!: ElementRef<HTMLVideoElement>;

  @ViewChild('fallbackHost', { static: true })
  private readonly fallbackHostRef!: ElementRef<HTMLElement>;

  ngAfterViewInit(): void {
    this.player.registerVideo(
      this.videoRef.nativeElement,
      this.fallbackHostRef.nativeElement
    );
  }

  ngOnDestroy(): void {
    this.player.unregisterVideo(this.videoRef.nativeElement);
  }

  async togglePictureInPicture(): Promise<void> {
    if (this.player.isPip()) {
      await this.player.dock();
      return;
    }
    await this.player.popOut();
  }

  openGuide(): void {
    void this.router.navigate(['/tha-spot'], {
      queryParams: { tv: '1' },
    });
  }

  close(): void {
    void this.player.close();
  }
}
