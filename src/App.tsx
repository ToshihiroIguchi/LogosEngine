import React from 'react';
import { NotebookProvider } from './context/NotebookContext';
import { NotebookContainer } from './components/Notebook/NotebookContainer';

const App: React.FC = () => {
  return (
    <NotebookProvider>
      <NotebookContainer />
    </NotebookProvider>
  );
};

export default App;
