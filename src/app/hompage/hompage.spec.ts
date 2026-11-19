import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Hompage } from './hompage';

describe('Hompage', () => {
  let component: Hompage;
  let fixture: ComponentFixture<Hompage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Hompage],
    }).compileComponents();

    fixture = TestBed.createComponent(Hompage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
