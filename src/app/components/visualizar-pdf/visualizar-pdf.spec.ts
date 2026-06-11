import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VisualizarPdf } from './visualizar-pdf';

describe('VisualizarPdf', () => {
  let component: VisualizarPdf;
  let fixture: ComponentFixture<VisualizarPdf>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VisualizarPdf],
    }).compileComponents();

    fixture = TestBed.createComponent(VisualizarPdf);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
