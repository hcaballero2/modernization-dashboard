import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-search-form',
  imports: [],
  templateUrl: './search-form.component.html',
  styleUrls: ['./search-form.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SearchFormComponent {
  organization = input('');
  token = input('');
  isLoading = input(false);
  formValid = input(false);

  organizationChange = output<string>();
  tokenChange = output<string>();
  searchTriggered = output<void>();

  onOrganizationChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.organizationChange.emit(target.value);
  }

  onTokenChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.tokenChange.emit(target.value);
  }

  onSearch(): void {
    this.searchTriggered.emit();
  }
}
