import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  computed,
} from '@angular/core';
import { ConnectionsService } from './connections.service';

@Component({
  selector: 'app-connections',
  templateUrl: './connections.component.html',
  styleUrls: ['./connections.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConnectionsComponent implements OnInit {
  connections = computed(() => this.connectionsService.getConnections()());

  constructor(private connectionsService: ConnectionsService) {}

  ngOnInit(): void {}

  addConnection(): void {
    // UI logic to add a new connection
  }
}
