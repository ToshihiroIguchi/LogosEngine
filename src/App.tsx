import { ThisShouldFailBuild } from './non-existent-file';
import { NotebookProvider } from './state/AppNotebookContext';
import { NotebookContainer } from './components/Notebook/NotebookContainer';

const App: React.FC = () => {
  return (
    <NotebookProvider>
      <NotebookContainer />
    </NotebookProvider>
  );
};

export default App;
