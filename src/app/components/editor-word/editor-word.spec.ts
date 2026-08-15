import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EditorWordComponent } from './editor-word';

describe('EditorWordComponent', () => {
  let component: EditorWordComponent;
  let fixture: ComponentFixture<EditorWordComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditorWordComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(EditorWordComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('preserva imagem encapsulada em hyperlink como imagem no DOCX', () => {
    const container = document.createElement('p');
    container.innerHTML = '<a href="https://exemplo.test"><img src="data:image/png;base64,iVBORw0KGgo=" alt="figura"></a>';

    const runs = (component as any).criarRuns(container) as Array<{ constructor: { name: string } }>;

    expect(runs).toHaveLength(1);
    expect(runs[0].constructor.name).toBe('ImageRun');
  });

  it('mantém hyperlink textual como hyperlink', () => {
    const container = document.createElement('p');
    container.innerHTML = '<a href="https://exemplo.test">Abrir site</a>';

    const runs = (component as any).criarRuns(container) as Array<{ constructor: { name: string } }>;

    expect(runs).toHaveLength(1);
    expect(runs[0].constructor.name).toBe('ExternalHyperlink');
  });
});
