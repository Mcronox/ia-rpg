// Busca a chave salva no navegador do usuário
let GEMINI_API_KEY = localStorage.getItem("GEMINI_API_KEY") || "";

function salvarChaveAPI() {
    const inputKey = document.getElementById('api-key-input').value.trim();
    if (inputKey) {
        localStorage.setItem("GEMINI_API_KEY", inputKey);
        GEMINI_API_KEY = inputKey;
        alert("Chave API salva com sucesso!");
    }
}
// --- ESTADO DO JOGO E MULTIPLAYER ---
let modoJogo = "solo"; // "solo" ou "multiplayer"
let peer = null;
let conexao = null;
let eHost = false;
let meuTurno = true;

// Estado Inicial do Personagem
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

// Guarda as informações do teste que o jogador está prestes a fazer
let testeAtivo = {
    requerido: false,
    atributo: "forca",
    ladosDado: 6
};

// Histórico de conversa para a IA lembrar do contexto
let historicoChat = [];

// Tabela de Efeitos Aleatórios por Classe (Fatores do Destino)
const destinoClasses = {
    "Guerreiro": [
        "Você começa com uma Espada de Aço Valiriano herdada de seu pai, garantindo +2 em testes de Força física.",
        "Sua armadura antiga está danificada, reduzindo sua iniciativa no primeiro combate, mas você possui um escudo resistente."
    ],
    "Mago": [
        "Seu grimório possui uma página misteriosa arrancada. Você sente que recuperá-la revelará um poder imenso.",
        "Um experimento antigo deu errado: você brilha levemente no escuro, o que dificultará se esconder, mas assusta criaturas das sombras."
    ],
    "Ladino": [
        "Você possui uma chave mestra dourada que abre quase qualquer fechadura comum, mas ela quebrará se você falhar num teste.",
        "Há um preço pela sua cabeça na taverna local. Alguns mercenários podem te reconhecer durante a jornada."
    ],
    "Clérigo": [
        "Sua divindade lhe concedeu uma premonição: você sabe que encontrará um aliado traidor em breve.",
        "Você carrega um frasco de Água Benta abençoada que pode purificar uma fonte de água ou causar dano massivo a um morto-vivo."
    ],
    "Bárbaro": [
        "Seu amuleto de dente de urso lhe dá resistência a venenos, mas sua fúria torna difícil dialogar diplomaticamente.",
        "Você foi banido de sua tribo por um crime que não cometeu. Membros do seu clã estão caçando você."
    ],
    "Bardo": [
        "Seu alaúde é mágico e consegue acalmar feras selvagens se você passar num teste de Carisma.",
        "Você conhece uma fofoca comprometedora sobre o rei local, o que pode te dar passe livre ou uma sentença de morte."
    ],
    "Paladino": [
        "Seu juramento sagrado brilha em seu peito. Mentir causa dor física em você, mas sua presença inspira camponeses.",
        "Você possui uma montaria leal (um cavalo de guerra), mas ele está exausto e precisará de descanso logo no início."
    ],
    "Arqueiro": [
        "Sua aljava mágica nunca fica totalmente vazia, mas suas flechas causam menos dano a curta distância.",
        "Você tem uma visão de águia incomparável, conseguindo enxergar perigos a milhas de distância antes de qualquer um."
    ],
    "Druida": [
        "Um pequeno esquilo falante acompanha você. Ele sabe segredos da floresta, mas é extremamente sarcástico.",
        "A natureza chora onde você pisa. Plantas murchas revivem temporariamente, revelando caminhos ocultos."
    ],
    "Necromante": [
        "Você carrega o crânio falante de seu antigo mentor. Ele sabe muito sobre magia, mas vive dando conselhos ruins.",
        "Animais comuns sentem pavor de você e fogem. Isso torna montarias inúteis, mas lobos hesitam antes de atacar."
    ],
    "Monge": [
        "Seu corpo é uma arma. Você não precisa de espadas, mas jurou nunca derramar sangue desnecessariamente.",
        "Você consegue prender a respiração por até 10 minutos, o que será extremamente útil se encontrar caminhos alagados."
    ],
    "Alquimista": [
        "Você começa com 3 poções instáveis: uma cura, uma explode e a terceira tem um efeito totalmente desconhecido.",
        "Suas mãos estão manchadas de reagentes químicos, permitindo que você identifique qualquer substância pelo cheiro."
    ],
    "Feiticeiro": [
        "Sua magia é instável. Sempre que tirar 1 no d20, um efeito caótico aleatório acontece ao seu redor.",
        "Você descende de uma linhagem de dragões. Criaturas reptilianas entendem seus comandos básicos."
    ],
    "Invocador": [
        "Você tem um pacto com uma pequena criatura do plano elemental. Ela pode atravessar paredes finas.",
        "Seu portal de invocação está instável. Às vezes, ao tentar invocar algo, apenas um pato inofensivo aparece."
    ],
    "Cavaleiro Rúnico": [
        "Sua armadura tem uma runa de proteção ativa que absorve o primeiro impacto de cada batalha.",
        "Você consegue ler escritas antigas gravadas em pedras e ruínas abandonadas sem precisar de testes."
    ]
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
}

function criarSala() {
    const salaId = Math.random().toString(36).substring(2, 8).toUpperCase();
    peer = new Peer(salaId);

    peer.on('open', (id) => {
        eHost = true;
        meuTurno = true;
        document.getElementById('room-status').innerText = `Sala Criada! Código: ${id} (Aguardando Jogador 2...)`;
    });

    peer.on('connection', (conn) => {
        conexao = conn;
        configurarEventosConexao();
        document.getElementById('room-status').innerText = "Jogador 2 Conectado! Podem iniciar a jornada.";
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
        meuTurno = false; // O segundo a entrar aguarda a vez do Host
        configurarEventosConexao();
        document.getElementById('room-status').innerText = "Conectado ao Host com sucesso!";
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
        case 'MENSAGEM_JOGADOR':
            adicionarMensagemJogador(dados.payload.nome, dados.payload.texto);
            meuTurno = true;
            atualizarIndicadorTurno();
            break;
        case 'MENSAGEM_MESTRE':
            adicionarMensagemMestre(dados.payload);
            analisarEAtivarPainelDeTeste(dados.payload);
            break;
        case 'HISTORICO_IA':
            historicoChat = dados.payload;
            break;
        case 'PASSAR_TURNO':
            meuTurno = true;
            atualizarIndicadorTurno();
            break;
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
        <p>Sua jornada começa sob um céu carregado de mistérios. Como você dá o seu primeiro passo?</p>
    `;
    document.getElementById('storyLog').innerHTML = mestreIntro;

    configurarPromptSistema(destinoSorteado);
}

// --- INTEGRAÇÃO COM A API DO GEMINI ---
function configurarPromptSistema(fatorDestino) {
    const promptSistema = `
Você é o Mestre de um jogo de RPG de mesa interpretativo, sombrio, cruel e sem piedade. 
O jogador principal se chama "${personagem.nome}", pertence à classe "${personagem.classe}" e possui estes atributos:
- Força: ${personagem.atributos.forca}
- Destreza: ${personagem.atributos.destreza}
- Inteligência: ${personagem.atributos.inteligencia}
- Constituição: ${personagem.atributos.constituicao}
- Carisma: ${personagem.atributos.carisma}

Fator do Destino inicial: "${fatorDestino}".

REGRAS CRUCIAIS DE JOGO E SOBREVIVÊNCIA:
1. Narre o ambiente de forma medieval, detalhada e opressora. As ameaças são reais e podem matar o herói.
2. Não jogue pelo jogador. Narre as consequências e dê 2 a 3 opções nítidas de ação.
3. Se o jogador tentar qualquer ação que exija esforço físico, agilidade, perícia, conhecimento ou lábia, você DEVE exigir que ele faça um teste. 
   - Ao propor o teste, você DEVE incluir de forma clara no texto a instrução exatamente neste formato:
     "[TESTE: Role d6/d10/d20 + Atributo]" (Exemplo: "[TESTE: Role d20 + Inteligencia]")
4. NÃO invente ou narre o resultado do teste antes do jogador rolar o dado. Aguarde ele rolar.
5. Quando o jogador informar o resultado da soma (Dado + Atributo), avalie friamente:
   - Resultados excelentes representam vitórias parciais ou totais.
   - Resultados baixos representam ferimentos graves, perda de equipamentos ou morte eminente. Seja cruel, não poupe a vida do jogador se as rolagens forem ruins.
6. Se a vida do personagem acabar de fato em decorrência das falhas, declare o fim da campanha (Fim de Jogo) tragicamente.
`;

    historicoChat = [
        { 
            role: "user", 
            parts: [{ text: promptSistema }] 
        },
        { 
            role: "model", 
            parts: [{ text: "Entendido. Serei um Mestre implacável e justo. Que os dados decidam se você sobreviverá." }] 
        }
    ];
}

async function enviarParaIA(mensagemJogador) {
    if (GEMINI_API_KEY === "SUA_CHAVE_AQUI_DENTRO" || GEMINI_API_KEY.trim() === "") {
        adicionarMensagemMestre("⚠️ [ERRO: Você precisa colar sua chave de API do Gemini no início do script.js para o mestre funcionar!]");
        return;
    }

    historicoChat.push({ 
        role: "user", 
        parts: [{ text: mensagemJogador }] 
    });

    if (modoJogo === "multiplayer") {
        enviarDadosRede('HISTORICO_IA', historicoChat);
    }

    const storyLog = document.getElementById('storyLog');
    const loadingId = "mestre-loading";
    
    if (!document.getElementById(loadingId)) {
        storyLog.innerHTML += `<p id="${loadingId}"><em>O Mestre está pensando...</em></p>`;
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

        if (data.error) {
            console.error("Erro da API:", data.error);
            historicoChat.pop();
            adicionarMensagemMestre(`⚠️ [Erro do Mestre: ${data.error.message}]`);
            return;
        }

        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts[0].text) {
            const respostaMestre = data.candidates[0].content.parts[0].text;
            
            historicoChat.push({ 
                role: "model", 
                parts: [{ text: respostaMestre }] 
            });
            
            adicionarMensagemMestre(respostaMestre);

            if (modoJogo === "multiplayer") {
                enviarDadosRede('MENSAGEM_MESTRE', respostaMestre);
                enviarDadosRede('HISTORICO_IA', historicoChat);
            }
            
            analisarEAtivarPainelDeTeste(respostaMestre);
        } else {
            console.error("Dados inesperados:", data);
            historicoChat.pop();
            adicionarMensagemMestre("O Mestre se perdeu nas brumas do vazio... Tente novamente.");
        }
    } catch (error) {
        console.error("Erro na requisição:", error);
        const loadingElement = document.getElementById(loadingId);
        if (loadingElement) loadingElement.remove();
        
        historicoChat.pop();
        adicionarMensagemMestre("Ocorreu uma falha na conexão com os planos arcanos. Tente novamente.");
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
        personagem.pontosLvlUp += 3; // +3 Pontos ao subir de nível
        personagem.xpNecessario = Math.floor(personagem.xpNecessario * 1.5); // Aumenta exigência de XP para o próximo nível

        const storyLog = document.getElementById('storyLog');
        storyLog.innerHTML += `<p class="system-msg" style="color: #ffd700; font-weight: bold;">🎉 NÍVEL AUMENTADO! Você subiu para o Nível ${personagem.nivel} e ganhou 3 pontos para distribuir!</p>`;
    }

    atualizarFichaInterface();
}

function subirAtributo(attr) {
    if (personagem.pontosLvlUp > 0) {
        personagem.atributos[attr]++;
        personagem.pontosLvlUp--;
        atualizarFichaInterface();
        
        const storyLog = document.getElementById('storyLog');
        storyLog.innerHTML += `<p class="system-msg" style="color:#2d6a4f"><em>Você aumentou sua ${attr.toUpperCase()} para ${personagem.atributos[attr]}!</em></p>`;
    }
}

// --- GERENCIAMENTO DE TURNOS ---
function atualizarIndicadorTurno() {
    const turnElem = document.getElementById('turn-indicator');
    if (modoJogo === 'solo') {
        turnElem.innerText = "Modo Solo - Seu Turno Livre";
        turnElem.style.color = "#ffd700";
    } else {
        if (meuTurno) {
            turnElem.innerText = "👉 SEU TURNO DE AGIR!";
            turnElem.style.color = "#2d6a4f";
        } else {
            turnElem.innerText = "⏳ TURNO DO COMPANHEIRO... (Aguarde)";
            turnElem.style.color = "#e63946";
        }
    }
}

// --- MECÂNICA DE TESTES INTEGRADA AO CHAT ---
function analisarEAtivarPainelDeTeste(texto) {
    const textoMinusculo = texto.toLowerCase();
    
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
    }
}

function confirmarEEnviarTeste() {
    const atributoSelecionado = document.getElementById('active-test-attribute').value;
    const dadoSelecionado = parseInt(document.getElementById('active-test-die').value);

    testeAtivo.atributo = atributoSelecionado;
    testeAtivo.ladosDado = dadoSelecionado;

    document.getElementById('test-selector-container').classList.add('hidden');

    const storyLog = document.getElementById('storyLog');
    storyLog.innerHTML += `<p class="system-msg" style="color: #ffd700; font-style: italic;">👉 <strong>Você preparou seu teste:</strong> Rolagem de d${dadoSelecionado} somada com o atributo ${atributoSelecionado.toUpperCase()} (Bônus de +${personagem.atributos[atributoSelecionado]}). Jogue o dado correspondente na Torre de Dados à direita!</p>`;
    storyLog.scrollTop = storyLog.scrollHeight;
}

// --- ROLAGEM DE DADOS INDIVIDUAIS COM ANIMAÇÃO ---
function animarERolarIndividual(lados) {
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
            const bonusAtributo = personagem.atributos[testeAtivo.atributo];
            const totalGeral = resultadoDado + bonusAtributo;

            document.getElementById('current-roll').innerText = `Tirou ${resultadoDado} + ${bonusAtributo} (${testeAtivo.atributo.toUpperCase()}) = ${totalGeral}!`;

            const mensagemTeste = `[SISTEMA: O jogador ${personagem.nome} executou o teste exigido. Rolagem do dado d${lados}: ${resultadoDado}. Seu bônus de ${testeAtivo.atributo.toUpperCase()} é +${bonusAtributo}. SOMA TOTAL DO TESTE = ${totalGeral}. Narre as consequências deste resultado!]`;
            
            testeAtivo.requerido = false;
            
            // Sucesso no teste concede mais XP
            ganharXP(25);
            enviarParaIA(mensagemTeste);
        } else {
            document.getElementById('current-roll').innerText = `Tirou ${resultadoDado} no d${lados}!`;
            enviarResultadoDadoParaMestre(resultadoDado, lados);
        }
    }, 800);
}

function enviarResultadoDadoParaMestre(resultado, lados) {
    const msg = `[SISTEMA: O jogador ${personagem.nome} realizou uma rolagem casual de d${lados} na mesa e obteve o resultado ${resultado}]`;
    enviarParaIA(msg);
}

// --- CONTROLES DE INTERFACE DO JOGO ---
function openTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active-content'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active-content');
    event.currentTarget.classList.add('active');
}

function atualizarFichaInterface() {
    for (const attr in personagem.atributos) {
        document.getElementById(`game-${attr}`).innerText = personagem.atributos[attr];
    }
    document.getElementById('view-nivel').innerText = parseInt(personagem.nivel);
    document.getElementById('level-points').innerText = parseInt(personagem.pontosLvlUp);

    // XP visual
    document.getElementById('view-xp').innerText = personagem.xp;
    document.getElementById('view-xp-max').innerText = personagem.xpNecessario;
    const porcentagem = Math.min((personagem.xp / personagem.xpNecessario) * 100, 100);
    document.getElementById('xp-bar').style.width = `${porcentagem}%`;

    const lvlUpBtns = document.querySelectorAll('.lvl-up-btn');
    lvlUpBtns.forEach(btn => {
        if (personagem.pontosLvlUp > 0) {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
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
        testeAtivo.requerido = false;
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

// Enviar ação escrita comum
function enviarAcao() {
    if (modoJogo === 'multiplayer' && !meuTurno) {
        alert("Aguarde o seu turno para realizar uma ação!");
        return;
    }

    const input = document.getElementById('playerInput');
    const valor = input.value.trim();
    
    if (valor !== "") {
        adicionarMensagemJogador(personagem.nome, valor);

        if (modoJogo === 'multiplayer') {
            enviarDadosRede('MENSAGEM_JOGADOR', { nome: personagem.nome, texto: valor });
            enviarDadosRede('PASSAR_TURNO', {});
            meuTurno = false;
            atualizarIndicadorTurno();
        }

        input.value = "";
        
        // Ação comum concede XP básico
        ganharXP(10);

        enviarParaIA(`${personagem.nome}: ${valor}`);
    }
}