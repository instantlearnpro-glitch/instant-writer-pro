import React, { useState, useEffect } from 'react';
import { getSystemFonts, FontDefinition } from '../utils/fontUtils';
import { FONTS } from '../constants';

const openFontDb = () => new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('spywriter-fonts', 1);
    request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('fonts')) {
            db.createObjectStore('fonts', { keyPath: 'name' });
        }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

export const loadFontsFromDb = async (): Promise<Array<{ name: string; dataUrl: string }>> => {
    try {
        const db = await openFontDb();
        const tx = db.transaction('fonts', 'readonly');
        const store = tx.objectStore('fonts');
        const getAll = store.getAll();
        return await new Promise<Array<{ name: string; dataUrl: string }>>((resolve) => {
            getAll.onsuccess = () => resolve(getAll.result || []);
            getAll.onerror = () => resolve([]);
        });
    } catch {
        return [];
    }
};

export const loadFontsFromStorage = (): Array<{ name: string; dataUrl: string }> => {
    try {
        const storedFonts = localStorage.getItem('custom_fonts');
        return storedFonts ? JSON.parse(storedFonts) : [];
    } catch {
        return [];
    }
};

export const useFontManager = () => {
    const [availableFonts, setAvailableFonts] = useState<FontDefinition[]>(FONTS.map(f => ({ ...f, available: true })));
    const [fontUploadMessage, setFontUploadMessage] = useState('');

    // Load available system fonts on mount and when web fonts are ready
    useEffect(() => {
        const loadFonts = async () => {
            const fonts = await getSystemFonts();
            setAvailableFonts(fonts);
        };

        loadFonts();

        // Re-check when document fonts are fully loaded (handles web font latency)
        document.fonts.ready.then(() => {
            loadFonts();
        });

        // Restore custom fonts (localStorage + IndexedDB)
        const storedFonts = localStorage.getItem('custom_fonts');
        if (storedFonts) {
            try {
                const fonts = JSON.parse(storedFonts) as Array<{ name: string; dataUrl: string; }>
                fonts.forEach(font => {
                    const fontFace = new FontFace(font.name, `url(${font.dataUrl})`);
                    fontFace.load().then(() => {
                        document.fonts.add(fontFace);
                        setAvailableFonts(prev => {
                            const exists = prev.some(f => f.name.toLowerCase() === font.name.toLowerCase());
                            if (exists) return prev;
                            return [{ name: font.name, value: `'${font.name}', sans-serif`, available: true }, ...prev];
                        });
                    });
                });
            } catch (e) {
                // ignore invalid storage
            }
        }

        loadFontsFromDb().then(fonts => {
            fonts.forEach(font => {
                const fontFace = new FontFace(font.name, `url(${font.dataUrl})`);
                fontFace.load().then(() => {
                    document.fonts.add(fontFace);
                    setAvailableFonts(prev => {
                        const exists = prev.some(f => f.name.toLowerCase() === font.name.toLowerCase());
                        if (exists) return prev;
                        return [{ name: font.name, value: `'${font.name}', sans-serif`, available: true }, ...prev];
                    });
                });
            });
        });
    }, []);

    const handleReloadFonts = async () => {
        const fonts = await getSystemFonts();
        setAvailableFonts(fonts);
    };

    const handleAddFont = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const fontName = file.name.replace(/\.(ttf|otf|woff2?|)$/i, '').trim() || 'Custom Font';
        try {
            const buffer = await file.arrayBuffer();
            const fontFace = new FontFace(fontName, buffer);
            await fontFace.load();
            document.fonts.add(fontFace);
            setAvailableFonts(prev => {
                const exists = prev.some(font => font.name.toLowerCase() === fontName.toLowerCase());
                if (exists) return prev;
                return [{ name: fontName, value: `'${fontName}', sans-serif`, available: true }, ...prev];
            });

            const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = () => reject(new Error('Failed to read font file'));
                reader.readAsDataURL(file);
            });

            let savedToStorage = false;
            try {
                const storedFonts = localStorage.getItem('custom_fonts');
                const list = storedFonts ? (JSON.parse(storedFonts) as Array<{ name: string; dataUrl: string }>) : [];
                const filtered = list.filter(font => font.name.toLowerCase() !== fontName.toLowerCase());
                filtered.unshift({ name: fontName, dataUrl });
                localStorage.setItem('custom_fonts', JSON.stringify(filtered.slice(0, 20)));
                savedToStorage = true;
            } catch {
                savedToStorage = false;
            }

            try {
                const dbRequest = indexedDB.open('spywriter-fonts', 1);
                dbRequest.onupgradeneeded = () => {
                    const db = dbRequest.result;
                    if (!db.objectStoreNames.contains('fonts')) {
                        db.createObjectStore('fonts', { keyPath: 'name' });
                    }
                };
                dbRequest.onsuccess = () => {
                    const db = dbRequest.result;
                    const tx = db.transaction('fonts', 'readwrite');
                    tx.objectStore('fonts').put({ name: fontName, dataUrl });
                };
            } catch {
                // ignore db errors
            }

            setFontUploadMessage(savedToStorage ? `Font loaded: ${fontName}` : `Font loaded (stored in DB): ${fontName}`);
            window.setTimeout(() => setFontUploadMessage(''), 2500);
        } catch (err) {
            alert('Failed to load font file. Please try a .ttf, .otf, .woff, or .woff2 file.');
        } finally {
            e.target.value = '';
        }
    };

    return {
        availableFonts,
        fontUploadMessage,
        handleReloadFonts,
        handleAddFont
    };
};
