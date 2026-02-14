import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import {
    GitProvider,
    TestProvider,
    ProducerProvider,
    ExtensionProvider,
    MetadataProvider,
    BuilderProvider,
} from "../contexts/index.ts";
import { Header } from "./Header.tsx";
import { TestExplorer } from "./TestExplorer.tsx";
import { BuilderPane } from "./BuilderPane.tsx";
import { ComponentExplorer } from "./ComponentExplorer.tsx";

export function App() {
    return (
        <FluentProvider theme={webLightTheme} style={{ height: "100%" }}>
            <GitProvider>
                <MetadataProvider>
                    <TestProvider>
                        <ProducerProvider>
                            <ExtensionProvider>
                                <BuilderProvider>
                                    <div className="app-layout">
                                        <Header />
                                        <div className="app-body">
                                            <TestExplorer />
                                            <BuilderPane />
                                            <ComponentExplorer />
                                        </div>
                                    </div>
                                </BuilderProvider>
                            </ExtensionProvider>
                        </ProducerProvider>
                    </TestProvider>
                </MetadataProvider>
            </GitProvider>
        </FluentProvider>
    );
}
