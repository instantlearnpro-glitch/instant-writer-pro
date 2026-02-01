import { FONTS } from '../constants';

export interface FontDefinition {
    name: string;
    value: string;
    available?: boolean;
}

// Canvas context for font measurement
let canvasContext: CanvasRenderingContext2D | null = null;

const getCanvasContext = () => {
    if (!canvasContext) {
        const canvas = document.createElement('canvas');
        canvasContext = canvas.getContext('2d');
    }
    return canvasContext;
};

/**
 * Checks if a font is available on the current system by measuring its width
 * against standard fallbacks (sans-serif, serif, monospace).
 */
export const isFontAvailable = (fontName: string): boolean => {
    // Clean font name (remove quotes)
    const cleanName = fontName.replace(/['"]/g, '').split(',')[0].trim();
    if (cleanName.toLowerCase() === 'inherit' || cleanName === '') return true;

    const context = getCanvasContext();
    if (!context) return false;

    const text = "abcdefghijklmnopqrstuvwxyz0123456789";
    
    const measure = (font: string) => {
        context.font = `72px ${font}`;
        return context.measureText(text).width;
    };

    const baseFonts = ['sans-serif', 'serif', 'monospace'];
    
    let detected = false;
    for (const base of baseFonts) {
        const baseWidth = measure(base);
        const fontWidth = measure(`'${cleanName}', ${base}`);
        
        // If dimensions differ, the font was applied
        if (baseWidth !== fontWidth) {
            detected = true;
            break;
        }
    }

    return detected;
};

/**
 * Retrieves the list of available fonts.
 * 1. Tries the experimental Local Font Access API.
 * 2. Falls back to checking the comprehensive FONTS list against the system.
 */
export const getSystemFonts = async (): Promise<FontDefinition[]> => {
    let systemFonts: FontDefinition[] = [];

    // 1. Try Local Font Access API (Chromium only, requires permission)
    if ('queryLocalFonts' in window) {
        try {
            // @ts-ignore - API might not be in TS lib
            const localFonts = await window.queryLocalFonts();
            
            // Deduplicate by family
            const families = new Set<string>();
            localFonts.forEach((f: any) => families.add(f.family));

            // Create definitions
            systemFonts = Array.from(families).sort().map(family => ({
                name: family,
                value: `'${family}', sans-serif`, // Default safe fallback
                available: true
            }));
            
            // If we got results, merge with our app-specific fonts
            if (systemFonts.length > 0) {
                // Ensure core app fonts are present
                const appFonts = FONTS.filter(f => 
                    ['Courier Prime', 'Black Ops One', 'Lobster', 'Default'].includes(f.name)
                ).map(f => ({ ...f, available: true })); // Assume web fonts are available

                return [...appFonts, ...systemFonts];
            }
        } catch (e) {
            console.warn('Local Font Access API denied or failed:', e);
            // Fallthrough to fallback
        }
    }

    // 2. Fallback: Validate predefined list
    return FONTS.map(font => ({
        ...font,
        // Always trust core app fonts that are loaded via CSS/Google Fonts
        available: ['Courier Prime', 'Black Ops One', 'Roboto', 'Default'].includes(font.name) 
            ? true 
            : isFontAvailable(font.value)
    }));
};
