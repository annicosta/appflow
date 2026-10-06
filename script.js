/* StudyFlow — MVP em JavaScript puro.
 * Camadas: Storage (localStorage) -> Estado -> Regras (cronograma/progresso) -> Renderização.
 * O Storage está isolado para ser trocado futuramente por API/banco em nuvem. */
(function () {
  "use strict";

  // ---------- Constantes ----------
  const KEY = "studyflow:v1";
  const DIAS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
  const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0]; // segunda primeiro
  const TIPOS = { tarefa: "Tarefa", prova: "Prova", trabalho: "Trabalho" };
  const PRIOS = { alta: "Alta", media: "Média", baixa: "Baixa" };
  const DIFS = { facil: "Fácil", media: "Média", dificil: "Difícil" };
  const EMOJI = { "matemática": "📐", "biologia": "🧬", "história": "📚", "física": "⚛️", "química": "🧪", "português": "✍️", "geografia": "🌎", "inglês": "🗣️", "filosofia": "💭", "sociologia": "👥" };
  const MAX_SESSAO = 60, PAUSA = 10, INICIO_DIA = 16 * 60;

  // ---------- Utilidades de data ----------
  const pad = (n) => String(n).padStart(2, "0");
  const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseISO = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const hojeISO = () => toISO(new Date());
  const addDias = (iso, n) => { const d = parseISO(iso); d.setDate(d.getDate() + n); return toISO(d); };
  const diffDias = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
  const fmtData = (iso) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
  const fmtHora = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
  const fmtDur = (min) => { const h = Math.floor(min / 60), m = min % 60; return h ? `${h}h${m ? pad(m) : ""}` : `${m} min`; };
  const inicioSemana = (iso) => { const d = parseISO(iso); const w = (d.getDay() + 6) % 7; return addDias(iso, -w); };
  const uid = () => Math.random().toString(36).slice(2, 10);
  const emoji = (m) => EMOJI[m.trim().toLowerCase()] || "📘";
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- Storage ----------
  const Storage = {
    load() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } },
    save(state) { localStorage.setItem(KEY, JSON.stringify(state)); }
  };

  /** Dados de demonstração para a primeira execução. */
  function dadosIniciais() {
    const h = hojeISO();
    const ontem = addDias(h, -1), anteontem = addDias(h, -2);
    const atividades = [
      { id: uid(), titulo: "Lista de Funções", materia: "Matemática", tipo: "tarefa", prazo: "2026-10-06", prioridade: "alta", dificuldade: "media", tempoEstimado: 60, status: "pendente", tempoConcluido: 0 },
      { id: uid(), titulo: "Prova de Genética", materia: "Biologia", tipo: "prova", prazo: "2026-10-09", prioridade: "alta", dificuldade: "dificil", tempoEstimado: 120, status: "pendente", tempoConcluido: 0 },
      { id: uid(), titulo: "Trabalho sobre República Velha", materia: "História", tipo: "trabalho", prazo: "2026-10-13", prioridade: "media", dificuldade: "media", tempoEstimado: 90, status: "pendente", tempoConcluido: 0 },
      { id: uid(), titulo: "Redação: Desafios da mobilidade urbana", materia: "Português", tipo: "tarefa", prazo: addDias(h, -1), prioridade: "media", dificuldade: "media", tempoEstimado: 45, status: "pendente", tempoConcluido: 0 },
      { id: uid(), titulo: "Exercícios de Estequiometria", materia: "Química", tipo: "tarefa", prazo: anteontem, prioridade: "media", dificuldade: "media", tempoEstimado: 60, status: "concluida", tempoConcluido: 60 },
      { id: uid(), titulo: "Vocabulário Unit 4", materia: "Inglês", tipo: "tarefa", prazo: ontem, prioridade: "baixa", dificuldade: "facil", tempoEstimado: 30, status: "concluida", tempoConcluido: 30 }
    ];
    const q = atividades[4], i = atividades[5];
    const sessoes = [
      { id: uid(), atividadeId: q.id, materia: q.materia, titulo: q.titulo, data: anteontem, horario: "16:00", duracao: 60, status: "concluida", concluidaEm: anteontem },
      { id: uid(), atividadeId: i.id, materia: i.materia, titulo: i.titulo, data: ontem, horario: "16:00", duracao: 30, status: "concluida", concluidaEm: ontem }
    ];
    const disponibilidade = [
      { diaSemana: 1, minutosDisponiveis: 60 }, { diaSemana: 2, minutosDisponiveis: 120 },
      { diaSemana: 3, minutosDisponiveis: 90 }, { diaSemana: 4, minutosDisponiveis: 120 },
      { diaSemana: 5, minutosDisponiveis: 60 }, { diaSemana: 6, minutosDisponiveis: 180 },
      { diaSemana: 0, minutosDisponiveis: 0 }
    ];
    return { atividades, sessoes, disponibilidade, avisos: [], geradoEm: null };
  }

  let state = Storage.load() || dadosIniciais();
  const salvar = () => { Storage.save(state); renderTudo(); };
  let filtro = "todas";

  // ---------- Regras de negócio ----------
  const isAtrasada = (a) => a.status !== "concluida" && a.prazo < hojeISO();
  const restante = (a) => Math.max(0, a.tempoEstimado - a.tempoConcluido);

  /** Pontuação de urgência: quanto maior, antes entra no cronograma. */
  function pontuacao(a, dia) {
    const dias = Math.max(0, diffDias(dia, a.prazo));
    const urgencia = 100 / (dias + 1);
    const peso = { prova: 1.6, trabalho: 1.15, tarefa: 1 }[a.tipo];
    const prio = { alta: 30, media: 15, baixa: 0 }[a.prioridade];
    const dif = { dificil: 10, media: 5, facil: 0 }[a.dificuldade];
    return urgencia * peso + prio + dif;
  }

  /**
   * Gera sessões para os próximos 7 dias (a partir de hoje).
   * 1) Remove sessões pendentes antigas (mantém histórico concluído).
   * 2) Para cada dia, ordena atividades pendentes pela pontuação.
   * 3) Passo A: no máximo uma sessão (≤60 min) por atividade no dia — espalha os estudos.
   *    Passo B: se sobrar tempo, permite sessões extras.
   * 4) Nunca ultrapassa os minutos disponíveis do dia; pausa de 10 min entre sessões.
   */
  function gerarCronograma() {
    const hoje = hojeISO();
    state.sessoes = state.sessoes.filter((s) => s.status === "concluida");
    const falta = {};
    state.atividades.filter((a) => a.status !== "concluida").forEach((a) => { falta[a.id] = restante(a); });
    const avisos = [];
    const totalDisp = state.disponibilidade.reduce((t, d) => t + d.minutosDisponiveis, 0);
    if (totalDisp === 0) { state.avisos = ["semtempo"]; state.geradoEm = hoje; return { total: 0 }; }

    let total = 0;
    for (let i = 0; i < 7; i++) {
      const dia = addDias(hoje, i);
      const disp = state.disponibilidade.find((d) => d.diaSemana === parseISO(dia).getDay()).minutosDisponiveis;
      let livre = disp, relogio = INICIO_DIA;
      const candidatas = () => state.atividades
        .filter((a) => falta[a.id] > 0 && a.prazo >= dia)
        .sort((x, y) => pontuacao(y, dia) - pontuacao(x, dia));
      const usadasHoje = new Set();
      for (const passo of ["A", "B"]) {
        let progrediu = true;
        while (livre >= 15 && progrediu) {
          progrediu = false;
          for (const a of candidatas()) {
            if (livre < 15) break;
            if (passo === "A" && usadasHoje.has(a.id)) continue;
            const dur = Math.min(MAX_SESSAO, falta[a.id], livre);
            state.sessoes.push({ id: uid(), atividadeId: a.id, materia: a.materia, titulo: (a.tipo === "prova" ? "Revisão para " : "") + a.titulo, data: dia, horario: fmtHora(relogio), duracao: dur, status: "pendente" });
            falta[a.id] -= dur; livre -= dur; relogio += dur + PAUSA; total++;
            usadasHoje.add(a.id); progrediu = true;
            if (passo === "A") continue;
            break; // passo B: reavalia ordem após cada sessão
          }
          if (passo === "A") break;
        }
      }
    }
    // Atividades que ficaram sem tempo antes do prazo
    if (Object.values(falta).some((m) => m > 0)) avisos.push("insuficiente");
    state.avisos = avisos; state.geradoEm = hoje;
    return { total };
  }

  /** Conclui uma sessão e soma o tempo à atividade. Atividade fecha ao atingir o tempo estimado. */
  function concluirSessao(id) {
    const s = state.sessoes.find((x) => x.id === id);
    if (!s || s.status === "concluida") return;
    s.status = "concluida"; s.concluidaEm = hojeISO();
    const a = state.atividades.find((x) => x.id === s.atividadeId);
    let msg = "Sessão concluída! Seu progresso foi atualizado.";
    if (a) {
      a.tempoConcluido = Math.min(a.tempoEstimado, a.tempoConcluido + s.duracao);
      if (a.tempoConcluido >= a.tempoEstimado && a.status !== "concluida") {
        a.status = "concluida"; msg = `Parabéns! "${a.titulo}" foi concluída.`;
      }
    }
    salvar(); toast(msg, "ok");
  }

  function concluirAtividade(id) {
    const a = state.atividades.find((x) => x.id === id);
    if (!a) return;
    a.status = "concluida"; a.tempoConcluido = Math.max(a.tempoConcluido, a.tempoEstimado);
    // atividade concluída não gera mais sessões
    state.sessoes = state.sessoes.filter((s) => !(s.atividadeId === id && s.status === "pendente"));
    salvar(); toast("Parabéns! Atividade concluída.", "ok");
  }

  function reabrirAtividade(id) {
    const a = state.atividades.find((x) => x.id === id);
    if (!a) return;
    a.status = "pendente"; a.tempoConcluido = 0;
    salvar(); toast("Atividade reaberta. Gere o cronograma novamente para incluí-la.");
  }

  function excluirAtividade(id) {
    const a = state.atividades.find((x) => x.id === id);
    if (!a || !confirm(`Excluir "${a.titulo}"? Essa ação não pode ser desfeita.`)) return;
    state.atividades = state.atividades.filter((x) => x.id !== id);
    state.sessoes = state.sessoes.filter((s) => s.atividadeId !== id || s.status === "concluida");
    salvar(); toast("Atividade excluída.");
  }

  /** Métricas calculadas a partir dos dados reais. */
  function metricas() {
    const ats = state.atividades;
    const concl = ats.filter((a) => a.status === "concluida").length;
    const pend = ats.length - concl;
    const sessOk = state.sessoes.filter((s) => s.status === "concluida");
    const minutos = sessOk.reduce((t, s) => t + s.duracao, 0);
    const ini = inicioSemana(hojeISO());
    const semana = ORDEM_DIAS.map((_, i) => {
      const d = addDias(ini, i);
      return { data: d, min: sessOk.filter((s) => s.concluidaEm === d).reduce((t, s) => t + s.duracao, 0) };
    });
    const dias = new Set(sessOk.map((s) => s.concluidaEm));
    let seq = 0, cur = hojeISO();
    if (!dias.has(cur)) cur = addDias(cur, -1); // sequência continua se estudou ontem
    while (dias.has(cur)) { seq++; cur = addDias(cur, -1); }
    const materias = {};
    ats.forEach((a) => {
      const m = (materias[a.materia] ||= { total: 0, feito: 0 });
      m.total += a.tempoEstimado; m.feito += a.status === "concluida" ? a.tempoEstimado : a.tempoConcluido;
    });
    const sessSemana = state.sessoes.filter((s) => s.data >= ini && s.data <= addDias(ini, 6));
    const semanaPct = sessSemana.length ? Math.round((sessSemana.filter((s) => s.status === "concluida").length / sessSemana.length) * 100) : 0;
    return { total: ats.length, concl, pend, pct: ats.length ? Math.round((concl / ats.length) * 100) : 0, minutos, sessoes: sessOk.length, semana, seq, materias, semanaPct, atrasadas: ats.filter(isAtrasada).length };
  }

  // ---------- Renderização ----------
  const $ = (s) => document.querySelector(s);

  function tags(a) {
    const t = [`<span class="tag">${TIPOS[a.tipo]}</span>`,
      `<span class="tag ${a.prioridade}">Prioridade: ${PRIOS[a.prioridade]}</span>`,
      `<span class="tag">${a.tipo === "prova" ? "Data" : "Prazo"}: ${fmtData(a.prazo)}</span>`,
      `<span class="tag">⏱ ${fmtDur(a.tempoEstimado)}</span>`];
    if (a.status === "concluida") t.push(`<span class="tag ok">✓ Concluída</span>`);
    else if (isAtrasada(a)) t.push(`<span class="tag late">⚠ Atrasada</span>`);
    else t.push(`<span class="tag">○ Pendente${a.tempoConcluido ? ` · ${a.tempoConcluido}/${a.tempoEstimado} min` : ""}</span>`);
    return t.join("");
  }

  function itemHTML(a, completo) {
    const acoes = completo ? `<div class="actions">
      <button class="btn ghost sm" data-ver="${a.id}" aria-label="Ver detalhes de ${esc(a.titulo)}">Ver</button>
      ${a.status === "concluida"
        ? `<button class="btn ghost sm" data-reabrir="${a.id}" aria-label="Reabrir ${esc(a.titulo)}">Reabrir</button>`
        : `<button class="btn ok sm" data-concluir="${a.id}" aria-label="Marcar ${esc(a.titulo)} como concluída">✓ Concluir</button>`}
      <button class="btn danger sm" data-excluir="${a.id}" aria-label="Excluir ${esc(a.titulo)}">Excluir</button></div>` : "";
    return `<li class="item t-${a.tipo} ${a.status === "concluida" ? "done" : ""}">
      <span class="emoji" aria-hidden="true">${emoji(a.materia)}</span>
      <div class="body"><div class="it-sub">${esc(a.materia)}</div><div class="it-title">${esc(a.titulo)}</div><div class="meta">${tags(a)}</div></div>${acoes}</li>`;
  }

  const vazio = (titulo, texto) => `<div class="empty"><strong>${titulo}</strong>${texto}</div>`;

  function renderInicio() {
    const m = metricas();
    const pend = state.atividades.filter((a) => a.status !== "concluida");
    const provas = pend.filter((a) => a.tipo === "prova" && a.prazo >= hojeISO());
    $("#home-stats").innerHTML = `
      <div class="stat brand"><span class="n">${m.total}</span><span class="l">atividades no total</span></div>
      <div class="stat"><span class="n">${m.pend}</span><span class="l">tarefas pendentes</span></div>
      <div class="stat"><span class="n">${provas.length}</span><span class="l">próximas provas${provas[0] ? ` · ${fmtData(provas.sort((a, b) => a.prazo.localeCompare(b.prazo))[0].prazo)}` : ""}</span></div>
      <div class="stat ${m.atrasadas ? "alert" : ""}"><span class="n">${m.atrasadas}</span><span class="l">${m.atrasadas ? "⚠ " : ""}atividades atrasadas</span></div>`;
    $("#home-week-pct").textContent = `${m.semanaPct}% das sessões da semana`;
    const bar = $("#home-week-bar"); bar.setAttribute("aria-valuenow", m.semanaPct); bar.firstElementChild.style.width = m.semanaPct + "%";

    const hoje = state.sessoes.filter((s) => s.data === hojeISO()).sort((a, b) => a.horario.localeCompare(b.horario));
    const entregasHoje = pend.filter((a) => a.prazo === hojeISO());
    let html = "";
    if (hoje.length) html += `<ul class="mini">${hoje.map((s) => `<li><span><b>${s.horario} · ${emoji(s.materia)} ${esc(s.materia)}</b>${esc(s.titulo)} · ${s.duracao} min</span>${s.status === "concluida" ? `<span class="tag ok">✓ Feita</span>` : `<button class="btn ok sm" data-sessao="${s.id}">Concluir sessão</button>`}</li>`).join("")}</ul>`;
    if (entregasHoje.length) html += `<ul class="list" style="margin-top:12px">${entregasHoje.map((a) => itemHTML(a)).join("")}</ul>`;
    $("#home-today").innerHTML = html || vazio("Nada marcado para hoje", "Gere seu cronograma para receber sessões de estudo.");

    const prox = pend.slice().sort((a, b) => a.prazo.localeCompare(b.prazo)).slice(0, 4);
    $("#home-next").innerHTML = prox.length ? `<ul class="list">${prox.map((a) => itemHTML(a)).join("")}</ul>` : vazio("Tudo em dia! 🎉", "Você não tem atividades pendentes.");
  }

  function renderAtividades() {
    const lista = state.atividades.filter((a) => {
      if (filtro === "todas") return true;
      if (filtro === "pendente") return a.status !== "concluida";
      if (filtro === "concluida") return a.status === "concluida";
      return a.tipo === filtro;
    }).sort((a, b) => (a.status === "concluida") - (b.status === "concluida") || a.prazo.localeCompare(b.prazo));
    $("#activity-list").innerHTML = lista.length ? lista.map((a) => itemHTML(a, true)).join("")
      : `<li>${vazio("Nenhuma atividade aqui", "Use “+ Nova atividade” para adicionar ao seu planejamento.")}</li>`;
    document.querySelectorAll("#filters .chip").forEach((c) => c.setAttribute("aria-pressed", c.dataset.filter === filtro));
  }

  function renderDisponibilidade() {
    $("#avail-grid").innerHTML = ORDEM_DIAS.map((d) => {
      const min = state.disponibilidade.find((x) => x.diaSemana === d).minutosDisponiveis;
      return `<fieldset class="day-box"><legend>${DIAS[d]}</legend><div class="hm">
        <label class="sr" for="h-${d}" style="position:absolute;left:-999px">Horas na ${DIAS[d]}</label>
        <input id="h-${d}" type="number" min="0" max="12" value="${Math.floor(min / 60)}" aria-label="Horas na ${DIAS[d]}" data-h="${d}"> h
        <input id="m-${d}" type="number" min="0" max="59" step="5" value="${min % 60}" aria-label="Minutos na ${DIAS[d]}" data-m="${d}"> min
      </div><span class="rest">${min ? fmtDur(min) + " disponíveis" : "😴 Descanso"}</span></fieldset>`;
    }).join("");
  }

  function renderCronograma() {
    const alertas = [];
    if (state.avisos.includes("semtempo")) alertas.push(`<div class="alert bad" role="alert">⚠ Você não informou nenhum horário disponível. Defina pelo menos um dia para gerar o cronograma.</div>`);
    if (state.avisos.includes("insuficiente")) alertas.push(`<div class="alert warn" role="alert">⚠ Seu tempo disponível pode não ser suficiente para concluir todas as atividades antes dos prazos.</div>`);
    if (state.geradoEm && !state.avisos.length) alertas.push(`<div class="alert ok">✓ Cronograma gerado! Todas as atividades pendentes cabem antes dos prazos.</div>`);
    $("#schedule-alert").innerHTML = alertas.join("");

    const hoje = hojeISO();
    const futuras = state.sessoes.filter((s) => s.data >= hoje);
    if (!futuras.length) {
      $("#schedule").innerHTML = vazio("Seu cronograma está vazio", "Informe sua disponibilidade e clique em “Gerar meu cronograma”.");
      return;
    }
    let html = `<div class="sched">`;
    for (let i = 0; i < 7; i++) {
      const dia = addDias(hoje, i);
      const ss = futuras.filter((s) => s.data === dia).sort((a, b) => a.horario.localeCompare(b.horario));
      const disp = state.disponibilidade.find((d) => d.diaSemana === parseISO(dia).getDay()).minutosDisponiveis;
      html += `<section class="sday" aria-label="${DIAS[parseISO(dia).getDay()]} ${fmtData(dia)}"><h3>${DIAS[parseISO(dia).getDay()]}<span>${i === 0 ? "Hoje" : fmtData(dia).slice(0, 5)}</span></h3>`;
      if (!ss.length) html += `<p class="rest-day">${disp ? "Sem sessões neste dia." : "😴 Dia de descanso"}</p>`;
      else html += `<ul>${ss.map((s) => {
        const [h, m] = s.horario.split(":").map(Number), fim = h * 60 + m + s.duracao;
        return `<li class="sess ${s.status === "concluida" ? "done" : ""}"><div class="time">${s.horario} – ${fmtHora(fim)}</div>
          <div><b>${emoji(s.materia)} ${esc(s.materia)}</b></div><div>${esc(s.titulo)}</div>
          <div class="row-between"><span class="muted">${s.duracao} min</span>${s.status === "concluida" ? `<span class="tag ok">✓ Concluída</span>` : `<button class="btn ok sm" data-sessao="${s.id}">Concluir sessão</button>`}</div></li>`;
      }).join("")}</ul>`;
      html += `</section>`;
    }
    $("#schedule").innerHTML = html + `</div>`;
  }

  function renderProgresso() {
    const m = metricas();
    $("#prog-ring").style.setProperty("--p", m.pct);
    $("#prog-pct").textContent = m.pct + "%";
    $("#prog-ring-txt").textContent = `${m.pct}% das atividades concluídas (${m.concl} de ${m.total}).`;
    let msg;
    if (!m.total) msg = "Cadastre sua primeira atividade para começar a acompanhar seu progresso.";
    else if (m.pct >= 75) msg = `Ótimo progresso! Você concluiu ${m.pct}% do seu planejamento desta semana.`;
    else if (m.pct >= 40) msg = `Bom ritmo! Você já concluiu ${m.pct}% do planejamento. Continue assim.`;
    else msg = `Cada sessão conta. Você concluiu ${m.pct}% — que tal uma sessão hoje?`;
    $("#prog-msg").textContent = msg;
    $("#prog-stats").innerHTML = `
      <div class="stat"><span class="n">${m.concl}</span><span class="l">atividades concluídas</span></div>
      <div class="stat"><span class="n">${m.pend}</span><span class="l">atividades pendentes</span></div>
      <div class="stat"><span class="n">${fmtDur(m.minutos)}</span><span class="l">estudadas</span></div>
      <div class="stat"><span class="n">${m.sessoes}</span><span class="l">sessões realizadas</span></div>
      <div class="stat brand"><span class="n">🔥 ${m.seq}</span><span class="l">${m.seq === 1 ? "dia seguido" : "dias seguidos"} estudando</span></div>`;
    const max = Math.max(60, ...m.semana.map((d) => d.min));
    $("#prog-week").innerHTML = m.semana.map((d) => `<div class="wb ${d.data === hojeISO() ? "today" : ""}" aria-label="${DIAS[parseISO(d.data).getDay()]}: ${d.min} minutos">
      <span>${d.min || ""}</span><div class="col" style="height:${(d.min / max) * 120}px"></div><span>${DIAS_CURTOS[parseISO(d.data).getDay()]}</span></div>`).join("");
    const subs = Object.entries(m.materias);
    $("#prog-subjects").innerHTML = subs.length ? subs.map(([nome, v]) => {
      const p = Math.round((v.feito / v.total) * 100);
      return `<div class="subj"><div class="row-between"><span>${emoji(nome)} ${esc(nome)}</span><b>${p}%</b></div>
        <div class="bar" role="progressbar" aria-label="${esc(nome)}" aria-valuenow="${p}" aria-valuemin="0" aria-valuemax="100"><span style="width:${p}%"></span></div></div>`;
    }).join("") : vazio("Sem matérias ainda", "Adicione atividades para ver o progresso por matéria.");
  }

  function renderTudo() { renderInicio(); renderAtividades(); renderCronograma(); renderProgresso(); }

  // ---------- Navegação ----------
  function irPara(view) {
    document.querySelectorAll(".view").forEach((v) => { v.hidden = v.id !== "view-" + view; });
    document.querySelectorAll(".nav-btn").forEach((b) => { if (b.dataset.view === view) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    if (view === "cronograma") renderDisponibilidade();
    history.replaceState(null, "", "#" + view);
    $("#main").focus({ preventScroll: true }); window.scrollTo(0, 0);
  }

  // ---------- Feedback ----------
  function toast(msg, tipo) {
    const el = document.createElement("div");
    el.className = "toast " + (tipo || ""); el.textContent = msg;
    $("#toasts").appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  // ---------- Formulário ----------
  function abrirForm() {
    const f = $("#activity-form"); f.reset();
    f.querySelectorAll("[aria-invalid]").forEach((i) => i.removeAttribute("aria-invalid"));
    f.querySelectorAll(".err").forEach((e) => (e.textContent = ""));
    $("#f-prazo").value = addDias(hojeISO(), 3);
    $("#form-dialog").showModal(); $("#f-titulo").focus();
  }

  function validar(d) {
    const e = {};
    if (!d.titulo || d.titulo.length < 3) e.titulo = "Informe um título com pelo menos 3 caracteres.";
    if (!d.materia || d.materia.length < 2) e.materia = "Informe a matéria.";
    if (!TIPOS[d.tipo]) e.tipo = "Escolha o tipo da atividade.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.prazo)) e.prazo = "Informe uma data válida.";
    else if (d.prazo < addDias(hojeISO(), -365)) e.prazo = "A data parece antiga demais.";
    if (!PRIOS[d.prioridade]) e.prioridade = "Escolha a prioridade.";
    if (!DIFS[d.dificuldade]) e.dificuldade = "Escolha a dificuldade.";
    if (!Number.isFinite(d.tempoEstimado) || d.tempoEstimado < 10 || d.tempoEstimado > 1200) e.tempoEstimado = "Use um valor entre 10 e 1200 minutos.";
    return e;
  }

  function salvarForm(ev) {
    ev.preventDefault();
    const f = ev.target, fd = new FormData(f);
    const d = { titulo: (fd.get("titulo") || "").trim(), materia: (fd.get("materia") || "").trim(), tipo: fd.get("tipo"), prazo: fd.get("prazo"), prioridade: fd.get("prioridade"), dificuldade: fd.get("dificuldade"), tempoEstimado: Number(fd.get("tempoEstimado")) };
    const erros = validar(d);
    const mapa = { titulo: "titulo", materia: "materia", tipo: "tipo", prazo: "prazo", prioridade: "prioridade", dificuldade: "dificuldade", tempoEstimado: "tempo" };
    let primeiro = null;
    Object.entries(mapa).forEach(([campo, idc]) => {
      const input = f.elements[campo], msg = erros[campo] || "";
      $("#e-" + idc).textContent = msg;
      if (msg) { input.setAttribute("aria-invalid", "true"); primeiro = primeiro || input; } else input.removeAttribute("aria-invalid");
    });
    if (primeiro) { primeiro.focus(); toast("Revise os campos destacados."); return; }
    state.atividades.push({ id: uid(), ...d, status: "pendente", tempoConcluido: 0 });
    $("#form-dialog").close(); salvar();
    toast("Atividade adicionada ao seu planejamento.", "ok");
  }

  function verAtividade(id) {
    const a = state.atividades.find((x) => x.id === id); if (!a) return;
    const sess = state.sessoes.filter((s) => s.atividadeId === id);
    $("#detail-body").innerHTML = `<div class="detail"><div class="it-sub">${emoji(a.materia)} ${esc(a.materia)}</div><h2 id="t-detail">${esc(a.titulo)}</h2>
      <dl><dt>Tipo</dt><dd>${TIPOS[a.tipo]}</dd><dt>${a.tipo === "prova" ? "Data" : "Prazo"}</dt><dd>${fmtData(a.prazo)}${isAtrasada(a) ? " (atrasada)" : ""}</dd>
      <dt>Prioridade</dt><dd>${PRIOS[a.prioridade]}</dd><dt>Dificuldade</dt><dd>${DIFS[a.dificuldade]}</dd>
      <dt>Tempo</dt><dd>${a.tempoConcluido} de ${a.tempoEstimado} min estudados</dd><dt>Status</dt><dd>${a.status === "concluida" ? "Concluída" : "Pendente"}</dd>
      <dt>Sessões</dt><dd>${sess.filter((s) => s.status === "concluida").length} feitas · ${sess.filter((s) => s.status === "pendente").length} agendadas</dd></dl>
      <div class="row-end"><button class="btn primary" data-action="fechar-detalhe">Fechar</button></div></div>`;
    $("#detail-dialog").showModal();
  }

  function salvarDisponibilidade(ev) {
    ev.preventDefault();
    state.disponibilidade = ORDEM_DIAS.map((d) => {
      const h = Math.min(12, Math.max(0, parseInt($(`[data-h="${d}"]`).value, 10) || 0));
      const m = Math.min(59, Math.max(0, parseInt($(`[data-m="${d}"]`).value, 10) || 0));
      return { diaSemana: d, minutosDisponiveis: h * 60 + m };
    });
    const r = gerarCronograma();
    salvar(); renderDisponibilidade();
    if (state.avisos.includes("semtempo")) toast("Defina pelo menos um dia com tempo disponível.");
    else if (!r.total) toast("Nenhuma atividade pendente para planejar. 🎉");
    else toast(`Cronograma gerado com ${r.total} sessões de estudo.`, "ok");
  }

  // ---------- Eventos (delegação) ----------
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button"); if (!t) return;
    const ds = t.dataset;
    if (ds.view) irPara(ds.view);
    else if (ds.action === "nova") abrirForm();
    else if (ds.action === "fechar") $("#form-dialog").close();
    else if (ds.action === "fechar-detalhe") $("#detail-dialog").close();
    else if (ds.filter) { filtro = ds.filter; renderAtividades(); }
    else if (ds.concluir) concluirAtividade(ds.concluir);
    else if (ds.reabrir) reabrirAtividade(ds.reabrir);
    else if (ds.excluir) excluirAtividade(ds.excluir);
    else if (ds.ver) verAtividade(ds.ver);
    else if (ds.sessao) concluirSessao(ds.sessao);
  });
  $("#activity-form").addEventListener("submit", salvarForm);
  $("#avail-form").addEventListener("submit", salvarDisponibilidade);
  $("#avail-grid").addEventListener("input", (e) => {
    const box = e.target.closest(".day-box"); if (!box) return;
    const [h, m] = box.querySelectorAll("input");
    const min = (parseInt(h.value, 10) || 0) * 60 + (parseInt(m.value, 10) || 0);
    box.querySelector(".rest").textContent = min ? fmtDur(min) + " disponíveis" : "😴 Descanso";
  });

  // ---------- Inicialização ----------
  Storage.save(state);
  renderTudo();
  const inicial = location.hash.slice(1);
  irPara(["inicio", "atividades", "cronograma", "progresso"].includes(inicial) ? inicial : "inicio");
})();
