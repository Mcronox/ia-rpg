// --- CONFIGURAÇÃO DA CHAVE DE API ---
let GEMINI_API_KEY = localStorage.getItem("GEMINI_API_KEY") || "";

document.addEventListener("DOMContentLoaded", () => {
    if (GEMINI_API_KEY) {
        const inputElem = document.getElementById('api-key-input');
        if (inputElem) inputElem.value = GEMINI_API_KEY;
    }
    atualizarEstadoCampos();
});

function salvarChaveAPI() {
    const inputKey = document.getElementById('api-key-input').value.trim();
    if (inputKey) {
        localStorage.setItem("GEMINI_API_KEY", inputKey);
        GEMINI_API_KEY = inputKey;
        alert("Chave API salva com sucesso!");
    } else {
        alert("Por favor, digite uma chave válida.");
    }
}

// --- ESTADO DO JOGO E MULTIPLAYER ---
let modoJogo = "solo";
let peer = null;
let conexao = null;
let eHost = false;
let jaAgioNesteTurno = false;

// Controle de turnos e mecânicas em grupo
let acoesDoTurno = []; 
let votosDoTurno = {}; // { nomeJogador: opcaoEscolhida }
let rolagemRealizadaNoTeste = false; // Garante que APENAS 1 pessoa role o dado em testes coletivos
let jogadorBloqueado = false; // Controle de bloqueio temporário (modo observador)
let jogadorAlvoExclusivo = null; // Se definido, apenas este jogador pode agir

let personagem = {
    nome: "",
    classe: "",
    atributos: { forca: 10, destreza: 10, inteligencia: 10, constituicao: 10, carisma: 10 },
    pontosDisponiveis: 10,
    nivel: 1,
    pontosLvlUp: 0,
    xp: 0,
    xpNecessario: 100
};

let testeAtivo = {
    requerido: false,
    atributo: "forca",
    ladosDado: 6,
    alvo: null // null para grupo todo, ou nome do personagem específico
};

let historicoChat = [];

const destinoClasses = {
    "Guerreiro": ["Você começa com uma Espada de Aço Valiriano herdada de seu pai, garantindo +2 em testes de Força física.", "Sua armadura antiga está danificada, reduzindo sua iniciativa no primeiro combate, mas você possui um escudo resistente."],
    "Mago": ["Seu grimório possui uma página misteriosa arrancada. Você sente que recuperá-la revelará um poder imenso.", "Um experimento antigo deu errado: você brilha levemente no escuro, o que dificultará se esconder, mas assusta criaturas das sombras."],
    "Ladino": ["Você possui uma chave mestra dourada que abre quase qualquer fechadura comum, mas ela quebrará se você falhar num teste.", "Há um preço pela sua cabeça na taverna local. Alguns mercenários podem te reconhecer durante a jornada."],
    "Clérigo": ["Sua divindade lhe concedeu uma premonição: você sabe que encontrará um aliado traidor em breve.", "Você carrega um frasco de Água Benta abençoada que pode purificar uma fonte de água ou causar dano massivo a um morto-vivo."],
    "Bárbaro": ["Seu amuleto de dente de urso lhe dá resistência a venenos, mas sua fúria torna difícil dialogar diplomaticamente.", "Você foi banido de sua tribo por um crime que não cometeu. Membros do seu clã estão caçando você."],
    "Bardo": ["Seu alaúde é mágico e consegue acalmar feras selvagens se você passar num teste de Carisma.", "Você conhece uma fofoca comprometedora sobre o rei local, o que pode te dar passe livre ou uma sentença de morte."],
    "Paladino": ["Seu juramento sagrado brilha em seu peito. Mentir causa dor física em você, mas sua presença inspira camponeses.", "Você possui uma montaria leal (um cavalo de guerra), mas ele está exausto e precisará de descanso logo no início."],
    "Arqueiro": ["Sua aljava mágica nunca fica totalmente vazia, mas suas flechas causam menos dano a curta distância.", "Você tem uma visão de águia incomparável, conseguindo enxergar perigos a milhas de distância antes de qualquer um."],
    "Druida": ["Um pequeno esquilo falante acompanha você. Ele sabe segredos da floresta, mas é extremamente sarcástico.", "A natureza chora onde você pisa. Plantas murchas revivem temporariamente, revelando caminhos ocultos."],
    "Necromante": ["Você carrega o crânio falante de seu antigo mentor. Ele sabe muito sobre magia, mas vive dando conselhos ruins.", "Animais comuns sentem pavor de você e fogem. Isso torna montarias inúteis, mas lobos hesitam antes de atacar."],
    "Monge": ["Seu corpo é uma arma. Você não precisa de espadas, mas jurou nunca derramar sangue desnecessariamente.", "Você consegue prender a respiração por até 10 minutos, o que será extremamente útil se encontrar caminhos alagados."],
    "Alquimista": ["Você começa com 3 poções instáveis: uma cura, uma explode e a terceira tem um efeito totalmente desconhecido.", "Suas mãos estão manchadas de reagentes químicos, permitindo que você identifique qualquer substância pelo cheiro."],
    "Feiticeiro": ["Sua magia é instável. Sempre que tirar 1 no d20, um efeito caótico aleatório acontece ao seu redor.", "Você descende de uma linhagem de dragões. Criaturas reptilianas entendem seus comandos básicos."],
    "Invocador": ["Você tem um pacto com uma pequena criatura do plano elemental. Ela pode atravessar paredes finas.", "Seu portal de invocação está instável. Às vezes, ao tentar invocar algo, apenas um pato inofensivo aparece."],
    "Cavaleiro Rúnico": ["Sua armadura tem uma runa de proteção ativa que absorve o primeiro impacto de cada batalha.", "Você consegue ler escritas antigas gravadas em pedras e ruínas abandonadas sem precisar de testes."]
};

// --- REDE E MULTIPLAYER (PEERJS) ---
function alternarModoJogo() {
    modoJogo = document.getElementById('game-mode').value;
    const mpPanel = document.getElementById('multiplayer-panel');
    if (modoJogo === 'multiplayer') {
        mpPanel.classList.remove('hidden');
    } else {
        mpPanel.classList.add('hidden');
    }
    atualizarIndicadorTurno();
}

function criarSala() {
    const salaId = Math.random().toString(36).substring(2, 8).toUpperCase();
    peer = new Peer(salaId);

    peer.on('open', (id) => {
        eHost = true;
        jaAgioNesteTurno = false;
        document.getElementById('room-status').innerText = `Sala Criada! Código: ${id} (Aguardando Jogador 2...)`;
        atualizarIndicadorTurno();
    });

    peer.on('connection', (conn) => {
        conexao = conn;
        configurarEventosConexao();
        document.getElementById('room-status').innerText = "Jogador 2 Conectado! Podem iniciar a jornada.";
        
        if (GEMINI_API_KEY) {
            enviarDadosRede('SYNC_API_KEY', GEMINI_API_KEY);
        }
    });

    peer.on('error', (err) => {
        alert("Erro ao criar sala: " + err);
    });
}

function entrarSala() {
    const salaId = document.getElementById('join-room-code').value.trim().toUpperCase();
    if (!salaId) {
        alert("Digite o código da sala para entrar!");
        return;
    }

    peer = new Peer();

    peer.on('open', () => {
        conexao = peer.connect(salaId);
        eHost = false;
        jaAgioNesteTurno = false;
        configurarEventosConexao();
        document.getElementById('room-status').innerText = "Conectado ao Host com sucesso!";
        atualizarIndicadorTurno();
    });

    peer.on('error', (err) => {
        alert("Erro ao conectar na sala: " + err);
    });
}

function configurarEventosConexao() {
    conexao.on('data', (dados) => {
        tratarDadosRecebidos(dados);
    });
}

function enviarDadosRede(tipo, payload) {
    if (conexao && conexao.open) {
        conexao.send({ tipo, payload });
    }
}

function tratarDadosRecebidos(dados) {
    switch (dados.tipo) {
        case 'SYNC_API_KEY':
            GEMINI_API_KEY = dados.payload;
            break;

        case 'REGISTRAR_ACAO_JOGADOR':
            adicionarMensagemJogador(dados.payload.nome, dados.payload.texto);
            if (eHost) {
                acoesDoTurno.push(`${dados.payload.nome}: ${dados.payload.texto}`);
                votosDoTurno[dados.payload.nome] = dados.payload.texto;
                verificarEProcessarTurnoColetivo();
            }
            break;

        case 'TESTE_REALIZADO':
            // Notifica todos da sala que a única rolagem permitida daquele teste já foi feita
            rolagemRealizadaNoTeste = true;
            adicionarMensagemJogador(dados.payload.nome, dados.payload.texto);
            if (eHost) {
                acoesDoTurno.push(`${dados.payload.nome}: ${dados.payload.texto}`);
                verificarEProcessarTurnoColetivo();
            }
            break;

        case 'MENSAGEM_MESTRE':
            adicionarMensagemMestre(dados.payload);
            analisarEAtivarPainelDeTeste(dados.payload);
            break;

        case 'NOVA_RODADA':
            jaAgioNesteTurno = false;
            rolagemRealizadaNoTeste = false;
            jogadorAlvoExclusivo = dados.payload.alvoExclusivo || null;
            atualizarIndicadorTurno();
            break;

        case 'HISTORICO_IA':
            historicoChat = dados.payload;
            break;
    }
}

// --- GERENCIAMENTO DE TURNOS E EXCLUSIVIDADE ---
function atualizarIndicadorTurno() {
    const turnElem = document.getElementById('turn-indicator');
    
    // Verifica se há um alvo exclusivo e se o jogador atual NÃO é essa pessoa
    if (jogadorAlvoExclusivo && jogadorAlvoExclusivo.toLowerCase() !== personagem.nome.toLowerCase()) {
        jogadorBloqueado = true;
        turnElem.innerText = `👁️ MODO OBSERVADOR: Apenas ${jogadorAlvoExclusivo} pode agir neste momento.`;
        turnElem.style.color = "#ff9900";
    } else {
        jogadorBloqueado = false;
        if (modoJogo === 'solo') {
            turnElem.innerText = "Modo Solo - Seu Turno Livre";
            turnElem.style.color = "#ffd700";
        } else {
            if (!jaAgioNesteTurno) {
                turnElem.innerText = "👉 SUA VEZ! Escolha sua ação ou vote na opção da equipe.";
                turnElem.style.color = "#2d6a4f";
            } else {
                turnElem.innerText = "⏳ AÇÃO ENVIADA! Aguardando o voto/ação dos outros jogadores...";
                turnElem.style.color = "#e63946";
            }
        }
    }
    atualizarEstadoCampos();
}

function atualizarEstadoCampos() {
    const inputElem = document.getElementById('playerInput');
    const sendBtn = document.getElementById('send-action-btn');

    if (inputElem && sendBtn) {
        if (jogadorBloqueado || (modoJogo === 'multiplayer' && jaAgioNesteTurno)) {
            inputElem.disabled = true;
            sendBtn.disabled = true;
            inputElem.placeholder = jogadorBloqueado 
                ? "Aguarde o jogador requisitado agir..." 
                : "Ação enviada! Aguardando o grupo...";
        } else {
            inputElem.disabled = false;
            sendBtn.disabled = false;
            inputElem.placeholder = "Digite sua ação ou escolha da rodada...";
        }
    }
}

// O Host apura os votos e executa a decisão com maior número de escolhas
function verificarEProcessarTurnoColetivo() {
    if (modoJogo === 'solo') return;

    // Se for ação individual restrita, espera apenas 1 ação
    const totalEsperado = jogadorAlvoExclusivo ? 1 : 2;

    if (acoesDoTurno.length >= totalEsperado) {
        let acaoFinalEnvio = "";

        if (!jogadorAlvoExclusivo && Object.keys(votosDoTurno).length > 0) {
            // Conta a escolha mais votada no grupo
            const contagemVotos = {};
            for (let player in votosDoTurno) {
                const voto = votosDoTurno[player];
                contagemVotos[voto] = (contagemVotos[voto] || 0) + 1;
            }

            let opcaoVencedora = "";
            let maxVotos = 0;
            for (let opcao in contagemVotos) {
                if (contagemVotos[opcao] > maxVotos) {
                    maxVotos = contagemVotos[opcao];
                    opcaoVencedora = opcao;
                }
            }

            acaoFinalEnvio = `[DECISÃO COLETIVA DO GRUPO (Mais Votada com ${maxVotos} votos)]:\n"${opcaoVencedora}"\n\nDetalhes das escolhas individuais:\n` + acoesDoTurno.join("\n");
        } else {
            acaoFinalEnvio = `[AÇÃO DA RODADA]:\n` + acoesDoTurno.join("\n");
        }

        // Reseta buffers
        acoesDoTurno = [];
        votosDoTurno = {};
        jaAgioNesteTurno = false;
        rolagemRealizadaNoTeste = false;
        jogadorAlvoExclusivo = null;

        // Atualiza a rodada em todos os dispositivos
        atualizarIndicadorTurno();
        enviarDadosRede('NOVA_RODADA', { alvoExclusivo: null });

        // Envia o resultado compilado para a IA
        enviarParaIA(acaoFinalEnvio);
    }
}

// --- FLUXO DE CRIAÇÃO ---
function distribuirPonto(attr, mod) {
    if (mod === 1 && personagem.pontosDisponiveis > 0) {
        personagem.atributos[attr]++;
        personagem.pontosDisponiveis--;
    } else if (mod === -1 && personagem.atributos[attr] > 10) {
        personagem.atributos[attr]--;
        personagem.pontosDisponiveis++;
    }
    
    document.getElementById(`setup-${attr}`).innerText = personagem.atributos[attr];
    document.getElementById('points-left').innerText = parseInt(personagem.pontosDisponiveis);
}

function iniciarJornada() {
    const nomeInput = document.getElementById('char-name').value.trim();
    if (nomeInput === "") {
        alert("Por favor, dê um nome ao seu herói antes de iniciar!");
        return;
    }
    if (personagem.pontosDisponiveis > 0) {
        alert("Distribua todos os 10 pontos de atributos antes de começar!");
        return;
    }

    personagem.nome = nomeInput;
    personagem.classe = document.getElementById('char-class').value;

    document.getElementById('view-nome').innerText = personagem.nome;
    document.getElementById('view-classe').innerText = personagem.classe;
    atualizarFichaInterface();
    atualizarIndicadorTurno();

    const possiveisDestinos = destinoClasses[personagem.classe];
    const destinoSorteado = possiveisDestinos[Math.floor(Math.random() * possiveisDestinos.length)];
    
    document.getElementById('intro-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');

    const mestreIntro = `
        <p><strong>Mestre:</strong> Bem-vindo, <strong>${personagem.nome}</strong>, o <strong>${personagem.classe}</strong>!</p>
        <p class="system-msg" style="color: #ffd700; font-style: italic;"><strong>Fator do Destino:</strong> ${destinoSorteado}</p>
        <p>Sua jornada começa sob um céu carregado de mistérios. Como o grupo dá o seu primeiro passo?</p>
    `;
    document.getElementById('storyLog').innerHTML = mestreIntro;

    configurarPromptSistema(destinoSorteado);
}

// --- INTEGRAÇÃO COM A API DO GEMINI ---
function configurarPromptSistema(fatorDestino) {
    const promptSistema = `
Você é o Mestre de um jogo de RPG de mesa interpretativo, sombrio e imersivo.
O jogo é disputado em GRUPO MULTIPLAYER.

Informações do jogador (${personagem.nome} - ${personagem.classe}):
- Força: ${personagem.atributos.forca} | Destreza: ${personagem.atributos.destreza} | Inteligência: ${personagem.atributos.inteligencia} | Constituição: ${personagem.atributos.constituicao} | Carisma: ${personagem.atributos.carisma}

Fator do Destino: "${fatorDestino}".

REGRAS CRUCIAIS DE NARRATIVA E GRUPO:
1. Apresente sempre 2 a 3 opções numeradas para o grupo votar e seguir em conjunto.
2. Em testes coletivos, APENAS 1 jogador precisa rolar os dados em nome do grupo (o primeiro a agir). Solicite o teste no formato: "[TESTE: Role d6/d10/d20 + Atributo]".
3. Se um evento for estritamente direcionado para APENAS UM JOGADOR (ex: uma armadilha individual ou visão), especifique claramente no texto usando a marcação: "[ALVO: NomeDoJogador]".
`;

    historicoChat = [
        { role: "user", parts: [{ text: promptSistema }] },
        { role: "model", parts: [{ text: "Entendido. Narraria a história respeitando as escolhas coletivas e ações individuais." }] }
    ];
}

async function enviarParaIA(mensagemJogador) {
    if (!GEMINI_API_KEY || GEMINI_API_KEY.trim() === "") {
        adicionarMensagemMestre("⚠️ [ERRO: Configure a chave de API no painel inicial!]");
        return;
    }

    historicoChat.push({ role: "user", parts: [{ text: mensagemJogador }] });

    if (modoJogo === "multiplayer") {
        enviarDadosRede('HISTORICO_IA', historicoChat);
    }

    const storyLog = document.getElementById('storyLog');
    const loadingId = "mestre-loading";
    
    if (!document.getElementById(loadingId)) {
        storyLog.innerHTML += `<p id="${loadingId}"><em>O Mestre está interpretando a decisão...</em></p>`;
        storyLog.scrollTop = storyLog.scrollHeight;
    }

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: historicoChat })
        });

        const data = await response.json();
        const loadingElement = document.getElementById(loadingId);
        if (loadingElement) loadingElement.remove();

        if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
            const respostaMestre = data.candidates[0].content.parts[0].text;
            
            historicoChat.push({ role: "model", parts: [{ text: respostaMestre }] });
            adicionarMensagemMestre(respostaMestre);

            if (modoJogo === "multiplayer") {
                enviarDadosRede('MENSAGEM_MESTRE', respostaMestre);
                enviarDadosRede('HISTORICO_IA', historicoChat);
            }
            
            analisarEAtivarPainelDeTeste(respostaMestre);
        } else {
            historicoChat.pop();
            adicionarMensagemMestre("O Mestre hesitou em sua decisão... Tente novamente.");
        }
    } catch (error) {
        const loadingElement = document.getElementById(loadingId);
        if (loadingElement) loadingElement.remove();
        historicoChat.pop();
        adicionarMensagemMestre("Ocorreu uma falha na conexão com os planos arcanos.");
    }
}

function adicionarMensagemMestre(texto) {
    const storyLog = document.getElementById('storyLog');
    const textoFormatado = texto.replace(/\n/g, "<br>");
    storyLog.innerHTML += `<p><strong>Mestre:</strong> ${textoFormatado}</p>`;
    storyLog.scrollTop = storyLog.scrollHeight;
}

function adicionarMensagemJogador(nome, texto) {
    const storyLog = document.getElementById('storyLog');
    storyLog.innerHTML += `<p><strong>${nome}:</strong> ${texto}</p>`;
    storyLog.scrollTop = storyLog.scrollHeight;
}

// --- SISTEMA DE EXP E LEVEL UP ---
function ganharXP(quantidade) {
    personagem.xp += quantidade;

    while (personagem.xp >= personagem.xpNecessario) {
        personagem.xp -= personagem.xpNecessario;
        personagem.nivel++;
        personagem.pontosLvlUp += 3;
        personagem.xpNecessario = Math.floor(personagem.xpNecessario * 1.5);

        const storyLog = document.getElementById('storyLog');
        storyLog.innerHTML += `<p class="system-msg" style="color: #ffd700; font-weight: bold;">🎉 NÍVEL AUMENTADO! Você subiu para o Nível ${personagem.nivel} e ganhou 3 pontos!</p>`;
    }

    atualizarFichaInterface();
}

function subirAtributo(attr) {
    if (personagem.pontosLvlUp > 0) {
        personagem.atributos[attr]++;
        personagem.pontosLvlUp--;
        atualizarFichaInterface();
    }
}

// --- DETECÇÃO DE AÇÕES INDIVIDUAIS E TESTES ---
function analisarEAtivarPainelDeTeste(texto) {
    const textoMinusculo = texto.toLowerCase();
    
    // Verifica se a ação é restrita a um jogador específico [ALVO: Nome]
    if (textoMinusculo.includes('[alvo:')) {
        const match = texto.match(/\[ALVO:\s*([^\]]+)\]/i);
        if (match && match[1]) {
            jogadorAlvoExclusivo = match[1].trim();
            if (eHost) {
                enviarDadosRede('NOVA_RODADA', { alvoExclusivo: jogadorAlvoExclusivo });
            }
            atualizarIndicadorTurno();
        }
    }

    if (textoMinusculo.includes('[teste:') || textoMinusculo.includes('role um d') || textoMinusculo.includes('teste de')) {
        let dadoDetectado = 20;
        if (textoMinusculo.includes('d6')) dadoDetectado = 6;
        else if (textoMinusculo.includes('d10')) dadoDetectado = 10;

        let attrDetectado = "forca";
        if (textoMinusculo.includes('destreza') || textoMinusculo.includes('agilidade')) attrDetectado = "destreza";
        else if (textoMinusculo.includes('inteligencia') || textoMinusculo.includes('sabedoria')) attrDetectado = "inteligencia";
        else if (textoMinusculo.includes('constituicao') || textoMinusculo.includes('resistencia')) attrDetectado = "constituicao";
        else if (textoMinusculo.includes('carisma') || textoMinusculo.includes('persuasao')) attrDetectado = "carisma";

        document.getElementById('active-test-attribute').value = attrDetectado;
        document.getElementById('active-test-die').value = dadoDetectado;
        document.getElementById('test-selector-container').classList.remove('hidden');
        
        testeAtivo.requerido = true;
        testeAtivo.atributo = attrDetectado;
        testeAtivo.ladosDado = dadoDetectado;
        rolagemRealizadaNoTeste = false; // Habilita para o 1º a rolar
    }
}

function confirmarEEnviarTeste() {
    const atributoSelecionado = document.getElementById('active-test-attribute').value;
    const dadoSelecionado = parseInt(document.getElementById('active-test-die').value);

    testeAtivo.atributo = atributoSelecionado;
    testeAtivo.ladosDado = dadoSelecionado;

    document.getElementById('test-selector-container').classList.add('hidden');
}

// --- ROLAGEM DE DADOS (1 APENAS ROLA POR TESTE COLETIVO) ---
function animarERolarIndividual(lados) {
    if (jogadorBloqueado) {
        alert("Ação bloqueada! Aguarde o momento do jogador selecionado.");
        return;
    }

    if (modoJogo === 'multiplayer' && jaAgioNesteTurno) {
        alert("Você já enviou sua ação nesta rodada!");
        return;
    }

    // Impede rolagens duplicadas se outro jogador já rolou para a ação em conjunto
    if (rolagemRealizadaNoTeste && testeAtivo.requerido) {
        alert("Um membro do grupo já realizou a rolagem deste teste!");
        return;
    }

    const diceElement = document.getElementById(`die-${lados}`);
    const rollClass = `rolling-d${lados}`;
    
    if (diceElement.classList.contains(rollClass)) return;

    diceElement.classList.add(rollClass);
    document.getElementById('current-roll').innerText = "Jogando na mesa...";

    setTimeout(() => {
        diceElement.classList.remove(rollClass);
        const resultadoDado = Math.floor(Math.random() * lados) + 1;
        diceElement.innerText = resultadoDado;

        if (testeAtivo.requerido && testeAtivo.ladosDado === lados) {
            rolagemRealizadaNoTeste = true; // Trava para os outros jogadores
            
            const bonusAtributo = personagem.atributos[testeAtivo.atributo];
            const totalGeral = resultadoDado + bonusAtributo;

            document.getElementById('current-roll').innerText = `Tirou ${resultadoDado} + ${bonusAtributo} (${testeAtivo.atributo.toUpperCase()}) = ${totalGeral}!`;

            const textoTeste = `[ROLAGEM DO GRUPO]: Teste de ${testeAtivo.atributo.toUpperCase()} (Dado d${lados}: ${resultadoDado} + Bônus: ${bonusAtributo} = Total: ${totalGeral})`;
            
            testeAtivo.requerido = false;
            ganharXP(25);

            adicionarMensagemJogador(personagem.nome, textoTeste);
            jaAgioNesteTurno = true;
            atualizarIndicadorTurno();

            if (modoJogo === 'multiplayer') {
                enviarDadosRede('TESTE_REALIZADO', { nome: personagem.nome, texto: textoTeste });
                if (eHost) {
                    acoesDoTurno.push(`${personagem.nome}: ${textoTeste}`);
                    verificarEProcessarTurnoColetivo();
                }
            } else {
                enviarParaIA(`${personagem.nome}: ${textoTeste}`);
            }
        } else {
            document.getElementById('current-roll').innerText = `Tirou ${resultadoDado} no d${lados}!`;
        }
    }, 800);
}

// --- CONTROLES DE INTERFACE E ENVIOS ---
function openTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active-content'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active-content');
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }
}

function atualizarFichaInterface() {
    for (const attr in personagem.atributos) {
        document.getElementById(`game-${attr}`).innerText = personagem.atributos[attr];
    }
    document.getElementById('view-nivel').innerText = parseInt(personagem.nivel);
    document.getElementById('level-points').innerText = parseInt(personagem.pontosLvlUp);

    document.getElementById('view-xp').innerText = personagem.xp;
    document.getElementById('view-xp-max').innerText = personagem.xpNecessario;
    const porcentagem = Math.min((personagem.xp / personagem.xpNecessario) * 100, 100);
    document.getElementById('xp-bar').style.width = `${porcentagem}%`;

    const lvlUpBtns = document.querySelectorAll('.lvl-up-btn');
    lvlUpBtns.forEach(btn => {
        btn.classList.toggle('hidden', personagem.pontosLvlUp <= 0);
    });
}

function novaJornada() {
    if (confirm("Tem certeza que deseja reiniciar sua jornada? Todo o progresso atual será perdido.")) {
        personagem = {
            nome: "",
            classe: "",
            atributos: { forca: 10, destreza: 10, inteligencia: 10, constituicao: 10, carisma: 10 },
            pontosDisponiveis: 10,
            nivel: 1,
            pontosLvlUp: 0,
            xp: 0,
            xpNecessario: 100
        };

        historicoChat = [];
        acoesDoTurno = [];
        votosDoTurno = {};
        testeAtivo.requerido = false;
        jogadorAlvoExclusivo = null;
        document.getElementById('test-selector-container').classList.add('hidden');

        document.getElementById('char-name').value = "";
        document.getElementById('points-left').innerText = "10";
        for (const attr in personagem.atributos) {
            document.getElementById(`setup-${attr}`).innerText = "10";
        }

        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('intro-screen').classList.remove('hidden');
    }
}

function enviarAcao() {
    if (jogadorBloqueado) {
        alert("Aguarde a sua vez! Apenas o jogador selecionado pelo Mestre pode interagir agora.");
        return;
    }

    if (modoJogo === 'multiplayer' && jaAgioNesteTurno) {
        alert("Você já enviou sua ação nesta rodada!");
        return;
    }

    const input = document.getElementById('playerInput');
    const valor = input.value.trim();
    
    if (valor !== "") {
        adicionarMensagemJogador(personagem.nome, valor);

        jaAgioNesteTurno = true;
        atualizarIndicadorTurno();

        if (modoJogo === 'multiplayer') {
            enviarDadosRede('REGISTRAR_ACAO_JOGADOR', { nome: personagem.nome, texto: valor });
            
            if (eHost) {
                acoesDoTurno.push(`${personagem.nome}: ${valor}`);
                votosDoTurno[personagem.nome] = valor;
                verificarEProcessarTurnoColetivo();
            }
        } else {
            ganharXP(10);
            enviarParaIA(`${personagem.nome}: ${valor}`);
        }

        input.value = "";
    }
}
