import json
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import fitz  # PyMuPDF
import io

app = FastAPI()

# Permite que o Angular (porta 4200) converse com o Python (porta 8000) sem travar no CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/extrair-textos")
async def extrair_textos(file: UploadFile = File(...), page: str = Form(...)):
    # 1. Lê o arquivo enviado pelo usuário
    conteudo = await file.read()
    doc = fitz.open(stream=conteudo, filetype="pdf")
    num_pagina = int(page)

    spans_extraidos = []

    if num_pagina < len(doc):
        pagina = doc[num_pagina]
        # Pega blocos de texto detalhados com as coordenadas (bbox) de cada linha
        dados_texto = pagina.get_text("blocks")

        for bloco in dados_texto:
            texto_puro = bloco[4].strip()
            if texto_puro:
                spans_extraidos.append({
                    "text": texto_puro,
                    "bbox": [bloco[0], bloco[1], bloco[2], bloco[3]]
                })

    return {"spans": spans_extraidos}

@app.post("/salvar-pdf")
async def salvar_pdf(file: UploadFile = File(...), modificacoes: str = Form(...)):
    try:
        conteudo = await file.read()
        doc = fitz.open(stream=conteudo, filetype="pdf")
        lista_mudancas = json.loads(modificacoes)

        for mudanca in lista_mudancas:
            texto_original = mudanca.get("textoOriginal")
            texto_novo = mudanca.get("text")

            # Só mexe no PDF se o texto realmente foi alterado
            if texto_original and texto_novo and texto_original.strip() != texto_novo.strip():
                for pagina in doc:
                    # Encontra onde o texto original está posicionado
                    retangulos = pagina.search_for(texto_original)
                    for rect in retangulos:
                        # 1. Aplica um retângulo branco para apagar o texto antigo
                        pagina.draw_rect(rect, color=(1, 1, 1), fill=(1, 1, 1))

                        # 2. Insere o novo texto ligeiramente ajustado na altura
                        # Usamos rect.y0 + (rect.height * 0.75) para simular a linha de base da fonte
                        ponto_insercao = fitz.Point(rect.x0, rect.y0 + (rect.height * 0.75))

                        pagina.insert_text(
                            ponto_insercao,
                            texto_novo,
                            fontsize=11,
                            color=(0, 0, 0),
                            fontname="helv" # Força uma fonte padrão segura que o PyMuPDF domina
                        )

        # Grava o resultado final em memória
        pdf_saida = io.BytesIO()
        doc.save(pdf_saida, garbage=3, deflate=True)
        pdf_saida.seek(0)

        return StreamingResponse(
            pdf_saida,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=pdf_editado_master.pdf"}
        )

    except Exception as e:
        print(f"ERRO FATAL NO PYTHON: {str(e)}")
        return {"status": "erro", "detalhes": str(e)}, 500
