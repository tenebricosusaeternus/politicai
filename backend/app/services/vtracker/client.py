import logging
from datetime import datetime, date, timedelta
from typing import Optional
from urllib.parse import urlparse
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

MONITORAMENTOS = {
    "radar_belem": 1856,
    "boletim_belem": 1857,
}

NOMES = {
    1856: "Radar Belém",
    1857: "Boletim Belém",
}


class VTrackerClient:
    def __init__(self):
        self.base_url = settings.VTRACKER_BASE_URL
        parsed = urlparse(self.base_url)
        self.app_base_url = f"{parsed.scheme}://{parsed.netloc}"
        self.developer_base_url = "https://developers.vtracker.com.br/api/rest"
        # A chave permanente usa a API pública /developers. O JWT do painel
        # fica apenas como fallback para endpoints antigos ainda não migrados.
        self._token: Optional[str] = settings.VTRACKER_TOKEN or None

    def _has_api_key(self) -> bool:
        return bool(settings.VTRACKER_API_KEY)

    def token_expirado(self) -> bool:
        """Verifica se o JWT já passou do exp (sem validar assinatura)."""
        import json as _json, base64 as _b64
        from datetime import datetime as _dt
        if not self._token:
            return True
        try:
            p = self._token.split(".")[1]
            p += "=" * (-len(p) % 4)
            exp = _json.loads(_b64.urlsafe_b64decode(p)).get("exp")
            return bool(exp) and _dt.now().timestamp() >= exp
        except Exception:
            return False

    def _headers(self) -> dict:
        if not self._token:
            raise ValueError(
                "Token V-Tracker não configurado. Renove o JWT em app.vtracker.com.br "
                "(F12 > Network > copie o header Authorization) e atualize VTRACKER_TOKEN no .env"
            )
        return {
            "Authorization": f"Bearer {self._token}",
            "Content-Type": "application/json",
        }

    def set_token(self, token: str):
        self._token = token

    def contas_insights(self) -> list:
        """Lista contas disponíveis no painel Monitoramento > Insights."""
        if self._has_api_key():
            with httpx.Client(timeout=30) as client:
                resp = client.get(
                    f"{self.developer_base_url}/contas/listar",
                    params={"key": settings.VTRACKER_API_KEY},
                )
                resp.raise_for_status()
                return [
                    {
                        "id": c.get("id"),
                        "nome": c.get("descricao") or "",
                        "servico": {
                            "id": c.get("servico_id"),
                            "nome": c.get("servico_descricao"),
                            "tipoRede": c.get("servico_descricao"),
                        },
                    }
                    for c in resp.json().get("contas", [])
                    if c.get("insights")
                ]
        with httpx.Client(timeout=30) as client:
            resp = client.get(
                f"{self.app_base_url}/insights/insights/getContasInsights",
                headers=self._headers(),
            )
            resp.raise_for_status()
            return resp.json()

    def insights_filtro(
        self,
        contas: list,
        data_inicio: date,
        data_fim: date,
        filtro_data_postagem: bool = False,
    ) -> list:
        """Busca métricas de página e postagens do painel de Insights."""
        if self._has_api_key():
            resultados = []
            with httpx.Client(timeout=90) as client:
                for conta in contas:
                    resp = client.get(
                        f"{self.developer_base_url}/insights/listar",
                        params={
                            "key": settings.VTRACKER_API_KEY,
                            "contaId": conta.get("id"),
                            "dataInicio": data_inicio.strftime("%d/%m/%Y 00:00:00"),
                            "dataFim": data_fim.strftime("%d/%m/%Y 23:59:59"),
                        },
                    )
                    if resp.status_code in (400, 404, 422):
                        continue
                    resp.raise_for_status()
                    resultados.append({
                        "api_origem": "developer",
                        "conta": conta,
                        "insights": resp.json().get("insights", []),
                    })
            return resultados
        body = {
            "contas": contas,
            "dataInicio": data_inicio.isoformat(),
            "dataFim": data_fim.isoformat(),
        }
        if filtro_data_postagem:
            body["filtroDataPostagemInsight"] = True
        with httpx.Client(timeout=90) as client:
            resp = client.post(
                f"{self.app_base_url}/insights/insights/filtro",
                json=body,
                headers=self._headers(),
            )
            if resp.status_code == 422:
                return []
            resp.raise_for_status()
            return resp.json()

    def _build_filter(self, monitoramento_id: int, data_inicio: date, data_fim: date,
                      pagina: int = 0, tamanho: int = 50) -> dict:
        return {
            "monitoramentoId": monitoramento_id,
            "dataInicio": data_inicio.strftime("%Y-%m-%d"),
            "dataFim": data_fim.strftime("%Y-%m-%d"),
            "pagina": pagina,
            "tamanhoPagina": tamanho,
        }

    def listar_ocorrencias(self, monitoramento_id: int, data_inicio: date,
                           data_fim: date, pagina: int = 0, tamanho: int = 50) -> dict:
        body = self._build_filter(monitoramento_id, data_inicio, data_fim + timedelta(days=1), pagina, tamanho)
        with httpx.Client(timeout=60) as client:
            resp = client.post(
                f"{self.base_url}/ocorrencia/listarAtivas",
                json=body,
                headers=self._headers(),
            )
            resp.raise_for_status()
            return resp.json()

    def listar_ocorrencias_janela(self, monitoramento_id: int,
                                  inicio_iso: str, fim_iso: str,
                                  tamanho: int = 50) -> list:
        """Busca ocorrências em janela de tempo ISO (ex: '2026-06-07T00:00:00').
        V-Tracker não suporta paginação real — retorna sempre os ~10 primeiros
        itens da janela. Use janelas pequenas para cobrir todo o período.
        """
        if self._has_api_key():
            ini = datetime.fromisoformat(inicio_iso)
            fim = datetime.fromisoformat(fim_iso)
            params = {
                "key": settings.VTRACKER_API_KEY,
                "monitoramentoId": monitoramento_id,
                "dataInicio": ini.strftime("%d/%m/%Y %H:%M:%S"),
                "dataFim": fim.strftime("%d/%m/%Y %H:%M:%S"),
                "sinceId": 0,
            }
            with httpx.Client(timeout=60) as client:
                resp = client.get(
                    f"{self.developer_base_url}/ocorrencias/listar",
                    params=params,
                )
                resp.raise_for_status()
                return resp.json().get("ocorrencias", [])

        body = {
            "monitoramentoId": monitoramento_id,
            "dataInicio": inicio_iso,
            "dataFim": fim_iso,
            "pagina": 0,
            "tamanhoPagina": tamanho,
        }
        with httpx.Client(timeout=30) as client:
            resp = client.post(
                f"{self.base_url}/ocorrencia/listarAtivas",
                json=body,
                headers=self._headers(),
            )
            resp.raise_for_status()
            return resp.json().get("content", [])

    def sentimentos(self, monitoramento_id: int, data_inicio: date, data_fim: date) -> dict:
        body = self._build_filter(monitoramento_id, data_inicio, data_fim, tamanho=1)
        with httpx.Client(timeout=60) as client:
            resp = client.post(
                f"{self.base_url}/ocorrencia/listarAtivas/sentimentos",
                json=body,
                headers=self._headers(),
            )
            resp.raise_for_status()
            return resp.json()

    def impressoes(self, monitoramento_id: int, data_inicio: date, data_fim: date) -> dict:
        body = self._build_filter(monitoramento_id, data_inicio, data_fim, tamanho=1)
        with httpx.Client(timeout=60) as client:
            resp = client.post(
                f"{self.base_url}/ocorrencia/listarAtivas/impressoes",
                json=body,
                headers=self._headers(),
            )
            resp.raise_for_status()
            return resp.json()

    def resumo_dia(self, monitoramento_id: int, dia: date) -> dict:
        """Retorna sentimentos + impressões + total para um dia específico."""
        proximo = dia + timedelta(days=1)
        sent = self.sentimentos(monitoramento_id, dia, proximo)
        imp = self.impressoes(monitoramento_id, dia, proximo)
        return {
            "monitoramento_id": monitoramento_id,
            "nome": NOMES.get(monitoramento_id, str(monitoramento_id)),
            "data": dia.isoformat(),
            "total": int(sent.get("positivas", 0)) + int(sent.get("neutras", 0)) +
                     int(sent.get("negativas", 0)) + int(sent.get("semQualificacao", 0)),
            "positivas": int(sent.get("positivas", 0)),
            "neutras": int(sent.get("neutras", 0)),
            "negativas": int(sent.get("negativas", 0)),
            "sem_qualificacao": int(sent.get("semQualificacao", 0)),
            "impressoes": int(imp.get("impressoes", 0)),
            "pessoas_alcancadas": int(imp.get("pessoas", 0)),
            "publicadores": int(imp.get("publicadores", 0)),
        }

    def resumo_periodo(self, monitoramento_id: int, data_inicio: date, data_fim: date) -> dict:
        """Retorna sentimentos + impressões para um período.
        data_fim é inclusivo — o cliente adiciona +1 dia internamente (V-Tracker usa fim exclusivo).
        """
        fim_exclusivo = data_fim + timedelta(days=1)
        sent = self.sentimentos(monitoramento_id, data_inicio, fim_exclusivo)
        imp = self.impressoes(monitoramento_id, data_inicio, fim_exclusivo)
        total = (int(sent.get("positivas", 0)) + int(sent.get("neutras", 0)) +
                 int(sent.get("negativas", 0)) + int(sent.get("semQualificacao", 0)))
        positivas = int(sent.get("positivas", 0))
        negativas = int(sent.get("negativas", 0))
        return {
            "monitoramento_id": monitoramento_id,
            "nome": NOMES.get(monitoramento_id, str(monitoramento_id)),
            "periodo": f"{data_inicio.isoformat()} a {data_fim.isoformat()}",
            "total": total,
            "positivas": positivas,
            "neutras": int(sent.get("neutras", 0)),
            "negativas": negativas,
            "sem_qualificacao": int(sent.get("semQualificacao", 0)),
            "score_sentimento": round((positivas - negativas) / total, 4) if total else 0,
            "impressoes": int(imp.get("impressoes", 0)),
            "pessoas_alcancadas": int(imp.get("pessoas", 0)),
            "publicadores": int(imp.get("publicadores", 0)),
        }


vtracker = VTrackerClient()
