import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ViolationDetail } from './violation-detail';

describe('ViolationDetail', () => {
  let component: ViolationDetail;
  let fixture: ComponentFixture<ViolationDetail>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViolationDetail],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(ViolationDetail);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
