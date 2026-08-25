import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AllTask } from './alltask';

describe('Alltask', () => {
  let component: AllTask;
  let fixture: ComponentFixture<AllTask>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AllTask],
    }).compileComponents();

    fixture = TestBed.createComponent(AllTask);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
