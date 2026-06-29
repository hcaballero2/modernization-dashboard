import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SearchFormComponent } from './search-form.component';

describe('SearchFormComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SearchFormComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(SearchFormComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('emits organizationChange when the organization input changes', () => {
    const fixture = TestBed.createComponent(SearchFormComponent);
    fixture.detectChanges();
    const emitted: string[] = [];
    fixture.componentInstance.organizationChange.subscribe((v: string) => emitted.push(v));

    const input = fixture.nativeElement.querySelector('#organization') as HTMLInputElement;
    input.value = 'my-org';
    input.dispatchEvent(new Event('input'));

    expect(emitted).toEqual(['my-org']);
  });

  it('emits tokenChange when the token input changes', () => {
    const fixture = TestBed.createComponent(SearchFormComponent);
    fixture.detectChanges();
    const emitted: string[] = [];
    fixture.componentInstance.tokenChange.subscribe((v: string) => emitted.push(v));

    const input = fixture.nativeElement.querySelector('#token') as HTMLInputElement;
    input.value = 'ghp_secret';
    input.dispatchEvent(new Event('input'));

    expect(emitted).toEqual(['ghp_secret']);
  });

  it('emits searchTriggered when the form is submitted', () => {
    const fixture = TestBed.createComponent(SearchFormComponent);
    fixture.componentRef.setInput('formValid', true);
    fixture.detectChanges();

    let emitted = false;
    fixture.componentInstance.searchTriggered.subscribe(() => { emitted = true; });

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit'));

    expect(emitted).toBe(true);
  });

  it('disables the submit button when the form is not valid', () => {
    const fixture = TestBed.createComponent(SearchFormComponent);
    fixture.componentRef.setInput('formValid', false);
    fixture.componentRef.setInput('isLoading', false);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('disables the submit button while loading', () => {
    const fixture = TestBed.createComponent(SearchFormComponent);
    fixture.componentRef.setInput('formValid', true);
    fixture.componentRef.setInput('isLoading', true);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('enables the submit button when valid and not loading', () => {
    const fixture = TestBed.createComponent(SearchFormComponent);
    fixture.componentRef.setInput('formValid', true);
    fixture.componentRef.setInput('isLoading', false);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });
});
