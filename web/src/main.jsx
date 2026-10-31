import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.jsx';
import TestLab from './TestLab.jsx';
import './style.css';

const isLocalTestLab=import.meta.env.DEV&&import.meta.env.VITE_ENABLE_TEST_LAB==='true'
 &&new URLSearchParams(window.location.search).get('test-lab')==='1';
createRoot(document.getElementById('root')).render(
 <React.StrictMode>{isLocalTestLab?<TestLab/>:<App/>}</React.StrictMode>
);
