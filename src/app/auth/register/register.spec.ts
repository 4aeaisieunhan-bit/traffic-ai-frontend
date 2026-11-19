import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { Register } from './register';

describe('Register', () => {
  let component: Register;
  let fixture: ComponentFixture<Register>;
  let http: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Register],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Register);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  function fillForm(): void {
    component.fullName = 'Nguyễn Văn A';
    component.email = 'A@Example.com ';
    component.password = 'secret123';
    component.confirmPassword = 'secret123';
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('rejects mismatched passwords without calling the API', () => {
    fillForm();
    component.confirmPassword = 'other';
    component.register();
    expect(component.errorMessage()).toContain('không khớp');
    http.expectNone(`${environment.apiUrl}/auth/register`);
  });

  it('tells the user to wait for approval when the new account is inactive', () => {
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fillForm();
    component.register();

    const req = http.expectOne(`${environment.apiUrl}/auth/register`);
    expect(req.request.body.email).toBe('a@example.com');
    req.flush({ id: 2, email: 'a@example.com', full_name: 'Nguyễn Văn A', role: 'officer', created_at: '', is_active: false });

    expect(navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { registered: 1, pending: 1, email: 'a@example.com' },
    });
  });
});
