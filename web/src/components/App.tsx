import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import {
    GitProvider,
    TestProvider,
    ProducerProvider,
    ExtensionProvider,
    MetadataProvider,
    BuilderProvider,
    AppModeProvider,
    CopilotProvider,
} from "../contexts/index.ts";
import { useAppMode } from "../contexts/AppModeContext.tsx";
import { Header } from "./Header.tsx";
import { TestExplorer } from "./TestExplorer.tsx";
import { BuilderPane } from "./BuilderPane.tsx";
import { ProducerBuilderPane } from "./ProducerBuilderPane.tsx";
import { ComponentExplorer } from "./ComponentExplorer.tsx";
import { CopilotChat } from "./CopilotChat.tsx";

function AppBody() {
    const { state } = useAppMode();
    return (
        <div className="app-body">
            <TestExplorer />
            {state.mode === "producerEditor"
                ? <ProducerBuilderPane />
                : <BuilderPane />
            }
            <ComponentExplorer />
        </div>
    );
}

export function App() {
    return (
        <FluentProvider theme={webLightTheme} style={{ height: "100%" }}>
            <GitProvider>
                <MetadataProvider>
                    <TestProvider>
                        <ProducerProvider>
                            <ExtensionProvider>
                                <BuilderProvider>
                                    <AppModeProvider>
                                        <CopilotProvider>
                                            <div className="app-layout">
                                                <Header />
                                                <AppBody />
                                            </div>
                                            <CopilotChat />
                                        </CopilotProvider>
                                    </AppModeProvider>
                                </BuilderProvider>
                            </ExtensionProvider>
                        </ProducerProvider>
                    </TestProvider>
                </MetadataProvider>
            </GitProvider>
        </FluentProvider>
    );
}
