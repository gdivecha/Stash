import axios from 'axios';
import { BACKEND_SERVER_URL, BACKEND_API_VERSION } from '../../env.js';

export const activeSessions = new Map(); // Map<email, token>
export let activeAccountEmail = null;

export const api = axios.create({
    baseURL: `${BACKEND_SERVER_URL}/${BACKEND_API_VERSION}`,
    withCredentials: true,
});

api.interceptors.request.use((config) => {
    if (activeAccountEmail && activeSessions.has(activeAccountEmail)) {
        config.headers.Cookie = `token=${activeSessions.get(activeAccountEmail)}`;
    }
    return config;
});

export function setSessionToken(token, email = 'default') {
    activeSessions.set(email, token);
    activeAccountEmail = email;
}

export function setActiveAccount(email) {
    activeAccountEmail = email;
}

export function getActiveAccount() {
    return activeAccountEmail;
}

export function extractCookieToken(res) {
    const setCookie = res.headers['set-cookie'];
    if (setCookie && setCookie.length > 0) {
        const tokenMatch = setCookie[0].match(/token=([^;]+)/);
        if (tokenMatch && tokenMatch[1]) {
            return tokenMatch[1];
        }
    }
    return null;
}
