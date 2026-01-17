import React from 'react';
import { NotebookProvider } from './state/AppNotebookContext';
import { MainContainer } from './components/Notebook/MainContainer';

const App: React.FC = () => {
  return (
    <NotebookProvider>
      <MainContainer />
    </NotebookProvider>
  );
};

export default App;
