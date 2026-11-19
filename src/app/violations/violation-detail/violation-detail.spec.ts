import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ViolationDetail } from './violation-detail';

describe('ViolationDetail', () => {
  let component: ViolationDetail;
  let fixture: ComponentFixture<ViolationDetail>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ViolationDetail],
    }).compileComponents();

    fixture = TestBed.createComponent(ViolationDetail);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
