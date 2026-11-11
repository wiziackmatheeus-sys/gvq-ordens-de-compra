// Inicialização única do Firebase, compartilhada por todas as páginas.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyAwxmAaWkFhlSxQhL8OidoKSjMkLGDgC5k",
    authDomain: "gvq-sistema-compras.firebaseapp.com",
    projectId: "gvq-sistema-compras",
    storageBucket: "gvq-sistema-compras.firebasestorage.app",
    messagingSenderId: "491539228108",
    appId: "1:491539228108:web:06a4e13caa1bb2cced2969"
};

// Nome próprio ("compras"): convive na mesma página com o Firebase das Ordens de Compra,
// e a sessão fica guardada separada da dele.
export const app = initializeApp(firebaseConfig, "compras");
export const auth = getAuth(app);
export const db = getFirestore(app);


export const storage = getStorage(app);
