import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EditarTextoComponent } from './editar-texto';

describe('EditarTextoComponent', () => {
  let component: EditarTextoComponent;
  let fixture: ComponentFixture<EditarTextoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditarTextoComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(EditarTextoComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
