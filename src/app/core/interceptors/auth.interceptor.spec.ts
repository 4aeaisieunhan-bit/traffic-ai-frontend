import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;

  beforeEach(() => {
    sessionStorage.setItem('traffic_ai_token', 'tok-123');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    backend.verify();
    sessionStorage.clear();
  });

  it('adds the bearer token to API requests', () => {
    http.get(`${environment.apiUrl}/auth/me`).subscribe();
    const req = backend.expectOne(`${environment.apiUrl}/auth/me`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer tok-123');
    expect(req.request.withCredentials).toBe(true);
    req.flush({});
  });

  it('adds the bearer token to backend media requests (/static/...)', () => {
    const url = `${environment.staticUrl}/static/evidence/evid_abc_1.jpg`;
    http.get(url, { responseType: 'blob' }).subscribe();
    const req = backend.expectOne(url);
    expect(req.request.headers.get('Authorization')).toBe('Bearer tok-123');
    req.flush(new Blob());
  });

  it('does not send the token to other hosts', () => {
    http.get('https://example.com/data.json').subscribe();
    const req = backend.expectOne('https://example.com/data.json');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });
});
