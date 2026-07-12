# Getting your `progress.sav` file

*[Português abaixo](#obtendo-seu-arquivo-progresssav)*

Zonai Codex reads a **copy** of your Tears of the Kingdom save file. Nothing is ever uploaded — the whole parse happens in your browser (see [PLANO.md](../PLANO.md) if you want to verify that claim in the source).

## What you need

- A Nintendo Switch with **homebrew access already set up** (this guide does not cover jailbreaking/CFW installation — that's a separate, console-specific process and outside the scope of this project).
- A save-management homebrew app, e.g. **JKSV** or **Checkpoint**, run from the Homebrew Menu.
- A way to move files from the SD card to your computer (card reader, or `ftpd`/network transfer).

## Steps

1. Launch your save manager (JKSV/Checkpoint) from the Homebrew Menu.
2. Find **The Legend of Zelda: Tears of the Kingdom** in the title list.
3. Export/back up the save to the SD card. This produces a folder per save slot (`slot_00`, `slot_01`, … `slot_05` — one per in-game save file).
4. Pull that folder off the SD card onto your computer.
5. Inside each `slot_XX` folder you'll find `progress.sav` — that's the file Zonai Codex reads. (The folder also has `caption.sav`, `footprint.sav`, etc. — those aren't used here.)
6. On the **Save** page, click **Choose progress.sav** and select the file for the slot you want to track.

## Notes

- Nothing is written back to your Switch automatically. If you use the in-app editor (Save → Edit & export), it downloads a **new** `progress.sav` to your computer — putting it back on your Switch (to actually change your game) is a manual step you do yourself, at your own risk, with your own save-management tool.
- Multiple save slots are independent — track whichever one you're actually playing.
- No account, no login, no telemetry. If you close the tab, re-import the file next time.

---

# Obtendo seu arquivo `progress.sav`

O Zonai Codex lê uma **cópia** do seu save de Tears of the Kingdom. Nada é enviado a servidor nenhum — o parse inteiro acontece no seu navegador (veja o [PLANO.md](../PLANO.md) se quiser conferir isso no código-fonte).

## O que você precisa

- Um Nintendo Switch com **acesso homebrew já configurado** (este guia não cobre jailbreak/instalação de CFW — isso é um processo separado, específico do console, e fora do escopo deste projeto).
- Um app homebrew de gerenciamento de saves, ex.: **JKSV** ou **Checkpoint**, rodado a partir do Homebrew Menu.
- Alguma forma de mover arquivos do cartão SD pro seu computador (leitor de cartão, ou transferência via `ftpd`/rede).

## Passos

1. Abra seu gerenciador de save (JKSV/Checkpoint) pelo Homebrew Menu.
2. Encontre **The Legend of Zelda: Tears of the Kingdom** na lista de jogos.
3. Exporte/faça backup do save pro cartão SD. Isso gera uma pasta por slot de save (`slot_00`, `slot_01`, … `slot_05` — um por arquivo de save do jogo).
4. Copie essa pasta do cartão SD pro seu computador.
5. Dentro de cada pasta `slot_XX` você vai achar `progress.sav` — é esse o arquivo que o Zonai Codex lê. (A pasta também tem `caption.sav`, `footprint.sav`, etc. — esses não são usados aqui.)
6. Na página **Save**, clique em **Choose progress.sav** e selecione o arquivo do slot que você quer trackear.

## Notas

- Nada é escrito de volta no seu Switch automaticamente. Se você usar o editor do app (Save → Edit & export), ele baixa um `progress.sav` **novo** pro seu computador — colocar esse arquivo de volta no Switch (pra realmente mudar seu jogo) é um passo manual que você faz por conta própria, por sua conta e risco, com sua própria ferramenta de gerenciamento de save.
- Slots de save são independentes — trackeie o que você realmente está jogando.
- Sem conta, sem login, sem telemetria. Se fechar a aba, é só reimportar o arquivo da próxima vez.
