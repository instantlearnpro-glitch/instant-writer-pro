# Bibbia funzionale dell'app

## Scopo
- Documento unico che descrive come ogni elemento deve funzionare.
- Usare prima di ogni modifica al codice per evitare regressioni.

## Regole di manutenzione
- Ogni modifica funzionale deve aggiornare questa bibbia.
- Se si cambia un comportamento, aggiornare prima la sezione relativa.
- Le sezioni con TODO vanno completate prima di rilasciare.

## Checklist prima di cambiare codice
- Leggi la sezione dell'elemento che toccherai.
- Verifica dipendenze e edge case elencati.
- Aggiorna qui se introduci un nuovo flusso o eccezione.

## Struttura delle sezioni
Per ogni elemento compilare:
- Scopo
- Input/props
- Output/eventi
- Comportamento normale
- Edge case e limiti
- Persistenza/stato
- Dipendenze
- Cose da non rompere
- Checklist rapida

## Elementi

### App (App.tsx)
- Scopo: orchestrare editor, stato documento, import/export, paginazione e struttura.
- Input/props: nessuno (root component).
- Output/eventi: passa callback a Editor/Toolbar/Sidebar; aggiorna docState e structureEntries.
- Comportamento normale:
  - Import HTML mantiene markup originale; aggiunge CSS base e applica override layout pagina.
  - Update H1/H2/H3 applica lo stile del testo selezionato a tutti gli heading.
  - Structure: manuale per default; Auto Fill solo su click; Auto: On/Off separato.
  - Pattern Structure: dopo 2+ heading manuali con stile simile apre lista per applicare lo stesso livello agli elementi simili.
  - Interruzione di pagina inserisce marker che blocca il pull-up.
- Edge case e limiti:
  - Se non esiste workspace usa DOMParser.
  - Clear Structure marca data-structure-status=rejected per evitare ri-scan e spegne Auto.
- Persistenza/stato: docState, selectionState, structureEntries, auto-structure flags.
- Dipendenze: utils/pagination, utils/structureScanner, components/*.
- Cose da non rompere:
  - Margini e dimensioni pagina fissi.
  - File importato non deve essere riscritto.
- Checklist rapida: Update H1 da selezione, Auto Fill, Clear Structure, page break.

### Entry point (index.tsx)
- Scopo: TODO
- Input/props: TODO
- Output/eventi: TODO
- Comportamento normale: TODO
- Edge case e limiti: TODO
- Persistenza/stato: TODO
- Dipendenze: TODO
- Cose da non rompere: TODO
- Checklist rapida: TODO

### Editor (components/Editor.tsx)
- Scopo: editor di testo “Word-like” con pagine fisse e selezione testo.
- Input/props: htmlContent, cssContent, selectionMode, callbacks di selezione e media.
- Output/eventi: onContentChange, onSelectionChange, onImageSelect, onPageBreak.
- Comportamento normale:
  - Selezione drag per testo, nessun riquadro sui paragrafi.
  - Forme/immagini/tabelle selezionabili con outline e manina.
  - Click tra blocchi sposta il cursore al blocco vicino; inserisce paragrafo solo sotto l'ultimo blocco.
  - Reflow con preservazione selezione dopo input/paste/cut.
- Edge case e limiti: non cambiare markup del testo; rispettare marker page-break.
- Persistenza/stato: selectionState, activeBlock, multi-selection.
- Dipendenze: utils/pagination, onSelectionChange, selectionMode.
- Cose da non rompere: testo editabile ovunque, nessun salto del cursore a pagina 1.
- Checklist rapida: click vuoto, drag selezione, Delete/Backspace, page break.

### Sidebar (components/Sidebar.tsx)
- Scopo: navigazione pagine, struttura manuale/auto, pannello AI.
- Input/props: structureEntries, selectionMode, callbacks struttura.
- Output/eventi: onStartSelection, onConfirmSelection, onAutoFillStructure, onClearStructure.
- Comportamento normale:
  - Add Manual Entries abilita selezione; Done applica; Cancel annulla.
  - Auto Fill compila su richiesta; Auto: On/Off abilita scansione continua.
  - Clear svuota la lista, disabilita le entry automatiche e spegne Auto.
- Edge case e limiti: mantenere pulsanti visibili (Done viola, Cancel lilla).
- Persistenza/stato: solo UI; stato reale in App.
- Dipendenze: StructureEntry, selectionMode.
- Cose da non rompere: manuale sempre disponibile, auto solo su click.
- Checklist rapida: Done/Cancel, Auto Fill, Auto On/Off, Clear.

### Toolbar (components/Toolbar.tsx)
- Scopo: TODO
- Input/props: TODO
- Output/eventi: TODO
- Comportamento normale: TODO
- Edge case e limiti: TODO
- Persistenza/stato: TODO
- Dipendenze: TODO
- Cose da non rompere: TODO
- Checklist rapida: TODO

### LinkToolbar (components/LinkToolbar.tsx)
- Scopo: TODO
- Input/props: TODO
- Output/eventi: TODO
- Comportamento normale: TODO
- Edge case e limiti: TODO
- Persistenza/stato: TODO
- Dipendenze: TODO
- Cose da non rompere: TODO
- Checklist rapida: TODO

### BlockContextMenu (components/BlockContextMenu.tsx)
- Scopo: TODO
- Input/props: TODO
- Output/eventi: TODO
- Comportamento normale: TODO
- Edge case e limiti: TODO
- Persistenza/stato: TODO
- Dipendenze: TODO
- Cose da non rompere: TODO
- Checklist rapida: TODO

### DragHandle (components/DragHandle.tsx)
- Scopo: TODO
- Input/props: TODO
- Output/eventi: TODO
- Comportamento normale: TODO
- Edge case e limiti: TODO
- Persistenza/stato: TODO
- Dipendenze: TODO
- Cose da non rompere: TODO
- Checklist rapida: TODO

### ZoomControls (components/ZoomControls.tsx)
- Scopo: TODO
- Input/props: TODO
- Output/eventi: TODO
- Comportamento normale: TODO
- Edge case e limiti: TODO
- Persistenza/stato: TODO
- Dipendenze: TODO
- Cose da non rompere: TODO
- Checklist rapida: TODO

### PageRuler (components/PageRuler.tsx)
- Scopo: TODO
- Input/props: TODO
- Output/eventi: TODO
- Comportamento normale: TODO
- Edge case e limiti: TODO
- Persistenza/stato: TODO
- Dipendenze: TODO
- Cose da non rompere: TODO
- Checklist rapida: TODO

### MarginGuides (components/MarginGuides.tsx)
- Scopo: TODO
- Input/props: TODO
- Output/eventi: TODO
- Comportamento normale: TODO
- Edge case e limiti: TODO
- Persistenza/stato: TODO
- Dipendenze: TODO
- Cose da non rompere: TODO
- Checklist rapida: TODO

### ImageOverlay (components/ImageOverlay.tsx)
- Scopo: TODO
- Input/props: TODO
- Output/eventi: TODO
- Comportamento normale: TODO
- Edge case e limiti: TODO
- Persistenza/stato: TODO
- Dipendenze: TODO
- Cose da non rompere: TODO
- Checklist rapida: TODO

### SettingsModal (components/SettingsModal.tsx)
- Scopo: TODO
- Input/props: TODO
- Output/eventi: TODO
- Comportamento normale: TODO
- Edge case e limiti: TODO
- Persistenza/stato: TODO
- Dipendenze: TODO
- Cose da non rompere: TODO
- Checklist rapida: TODO

### ExportModal (components/ExportModal.tsx)
- Scopo: TODO
- Input/props: TODO
- Output/eventi: TODO
- Comportamento normale: TODO
- Edge case e limiti: TODO
- Persistenza/stato: TODO
- Dipendenze: TODO
- Cose da non rompere: TODO
- Checklist rapida: TODO

### TOCModal (components/TOCModal.tsx)
- Scopo: inserire/rimuovere un Table of Contents generato.
- Input/props: onInsert, onRemove.
- Output/eventi: inserisce TOC o lo rimuove.
- Comportamento normale: Insert crea TOC, Remove elimina TOC dal documento.
- Edge case e limiti: se non ci sono heading mostra alert.
- Persistenza/stato: nessuna.
- Dipendenze: App handleInsertTOC / handleRemoveTOC.
- Cose da non rompere: Remove non deve toccare contenuto non-TOC.
- Checklist rapida: Insert e Remove.

### Pagination (utils/pagination.ts)
- Scopo: mantenere pagine fisse e spostare contenuti senza cambiare markup.
- Comportamento normale:
  - Margini e altezza pagina fissi (nessun auto-resize).
  - Overflow calcolato sul fondo dell’ultimo elemento in flow.
  - Move: sposta interi blocchi; tabelle intere alla pagina successiva.
  - Split: contenitori neutri si dividono per figli; testo può continuare per righe se necessario.
  - Pull-up: se c’è spazio reale, elementi risalgono dalla pagina sotto.
- Cose da non rompere: niente splitting su tabelle, nessuna modifica stile originale.

### TableTocModal (components/TableTocModal.tsx)
- Scopo: TODO
- Input/props: TODO
- Output/eventi: TODO
- Comportamento normale: TODO
- Edge case e limiti: TODO
- Persistenza/stato: TODO
- Dipendenze: TODO
- Cose da non rompere: TODO
- Checklist rapida: TODO

### QRCodeModal (components/QRCodeModal.tsx)
- Scopo: TODO
- Input/props: TODO
- Output/eventi: TODO
- Comportamento normale: TODO
- Edge case e limiti: TODO
- Persistenza/stato: TODO
- Dipendenze: TODO
- Cose da non rompere: TODO
- Checklist rapida: TODO

### PageNumberModal (components/PageNumberModal.tsx)
- Scopo: TODO
- Input/props: TODO
- Output/eventi: TODO
- Comportamento normale: TODO
- Edge case e limiti: TODO
- Persistenza/stato: TODO
- Dipendenze: TODO
- Cose da non rompere: TODO
- Checklist rapida: TODO

### AutoLogModal (components/AutoLogModal.tsx)
- Scopo: TODO
- Input/props: TODO
- Output/eventi: TODO
- Comportamento normale: TODO
- Edge case e limiti: TODO
- Persistenza/stato: TODO
- Dipendenze: TODO
- Cose da non rompere: TODO
- Checklist rapida: TODO

### PatternModal (components/PatternModal.tsx)
- Scopo: TODO
- Input/props: TODO
- Output/eventi: TODO
- Comportamento normale: TODO
- Edge case e limiti: TODO
- Persistenza/stato: TODO
- Dipendenze: TODO
- Cose da non rompere: TODO
- Checklist rapida: TODO

### BorderModal (components/BorderModal.tsx)
- Scopo: TODO
- Input/props: TODO
- Output/eventi: TODO
- Comportamento normale: TODO
- Edge case e limiti: TODO
- Persistenza/stato: TODO
- Dipendenze: TODO
- Cose da non rompere: TODO
- Checklist rapida: TODO

### Gemini service (services/geminiService.ts)
- Scopo: TODO
- Input/props: TODO
- Output/eventi: TODO
- Comportamento normale: TODO
- Edge case e limiti: TODO
- Persistenza/stato: TODO
- Dipendenze: TODO
- Cose da non rompere: TODO
- Checklist rapida: TODO

### Pagination (utils/pagination.ts)
- Scopo: TODO
- Input/props: TODO
- Output/eventi: TODO
- Comportamento normale: TODO
- Edge case e limiti: TODO
- Persistenza/stato: TODO
- Dipendenze: TODO
- Cose da non rompere: TODO
- Checklist rapida: TODO

### Auto log (utils/autoLog.ts)
- Scopo: TODO
- Input/props: TODO
- Output/eventi: TODO
- Comportamento normale: TODO
- Edge case e limiti: TODO
- Persistenza/stato: TODO
- Dipendenze: TODO
- Cose da non rompere: TODO
- Checklist rapida: TODO

### Pattern detector (utils/patternDetector.ts)
- Scopo: TODO
- Input/props: TODO
- Output/eventi: TODO
- Comportamento normale: TODO
- Edge case e limiti: TODO
- Persistenza/stato: TODO
- Dipendenze: TODO
- Cose da non rompere: TODO
- Checklist rapida: TODO

### Pattern context (utils/PatternContext.tsx)
- Scopo: TODO
- Input/props: TODO
- Output/eventi: TODO
- Comportamento normale: TODO
- Edge case e limiti: TODO
- Persistenza/stato: TODO
- Dipendenze: TODO
- Cose da non rompere: TODO
- Checklist rapida: TODO

### Structure scanner (utils/structureScanner.ts)
- Scopo: TODO
- Input/props: TODO
- Output/eventi: TODO
- Comportamento normale: TODO
- Edge case e limiti: TODO
- Persistenza/stato: TODO
- Dipendenze: TODO
- Cose da non rompere: TODO
- Checklist rapida: TODO

### Font utils (utils/fontUtils.ts)
- Scopo: TODO
- Input/props: TODO
- Output/eventi: TODO
- Comportamento normale: TODO
- Edge case e limiti: TODO
- Persistenza/stato: TODO
- Dipendenze: TODO
- Cose da non rompere: TODO
- Checklist rapida: TODO

### Constants (constants.ts)
- Scopo: TODO
- Input/props: TODO
- Output/eventi: TODO
- Comportamento normale: TODO
- Edge case e limiti: TODO
- Persistenza/stato: TODO
- Dipendenze: TODO
- Cose da non rompere: TODO
- Checklist rapida: TODO

### Types (types.ts)
- Scopo: TODO
- Input/props: TODO
- Output/eventi: TODO
- Comportamento normale: TODO
- Edge case e limiti: TODO
- Persistenza/stato: TODO
- Dipendenze: TODO
- Cose da non rompere: TODO
- Checklist rapida: TODO
